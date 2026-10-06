// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {LstStrategy} from "./LstStrategy.sol";

/// @notice The Community Pool: where guild treasuries earn yield. It is the SplitVault's strategy,
///         so a guild still decides only how much of its treasury goes in (the Allocate vote, up to
///         50%), and every dollar in here keeps counting as treasury money that a spend can pull
///         back out.
///
///         The pool splits what it holds between two legs:
///         - token staking: an ERC-4626 vault over mUSD (the testnet MockYieldVault);
///         - liquid staking: mUSD swapped to mMON and staked as stMON (LstStrategy).
///         The curator (jagomoko, not each guild) sets the liquid staking share, at most 50%, so at
///         most a quarter of any treasury is ever exposed to the MON price.
///
///         Paying out takes idle money first, then token staking, then liquid staking through its
///         instant exit, so a treasury spend never waits for unbonding.
/// @dev Only the SplitVault may deposit, and a deposit mints shares for the value it actually
///      added (after the liquid staking leg's swap and exit fees), so each guild pays its own entry
///      cost instead of sharing it with the others. Moves the curator orders are shared by all.
contract CommunityPoolVault is ERC4626, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant CURATOR = keccak256("CURATOR");
    uint16 public constant BPS = 10_000;
    /// @dev the most of the pool the curator can put into liquid staking
    uint16 public constant MAX_LST_BPS = 5_000;
    /// @dev a leg move smaller than this share of the pool is skipped (keeps it dust-proof)
    uint16 public constant MIN_MOVE_BPS = 100;

    IERC4626 public immutable stable;
    LstStrategy public immutable lstLeg;
    /// @dev the SplitVault: the only depositor
    address public immutable depositor;

    /// @notice the share of the pool the curator wants in liquid staking
    uint16 public lstBps;
    /// @notice after an emergency exit everything stays idle until the admin resumes
    bool public parked;

    event MixSet(uint16 lstBps);
    event LegsRebalanced(uint256 toLst, uint256 toStable);
    event Parked(bool parked);

    error NotDepositor();
    error ZeroAmount();
    error InvalidMix();
    error WrongAsset();

    constructor(IERC20 usd, IERC4626 stable_, LstStrategy lstLeg_, address depositor_, uint16 lstBps_, address admin)
        ERC20("Jagomoko Community Pool", "jPOOL")
        ERC4626(usd)
    {
        if (stable_.asset() != address(usd) || address(lstLeg_.usd()) != address(usd)) revert WrongAsset();
        stable = stable_;
        lstLeg = lstLeg_;
        depositor = depositor_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CURATOR, admin);
        _setMix(lstBps_);
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    // ---- value ----

    function idleAssets() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice what the token staking leg would pay out now
    function stableValue() public view returns (uint256) {
        uint256 s = stable.balanceOf(address(this));
        return s == 0 ? 0 : stable.previewRedeem(s);
    }

    /// @notice what the liquid staking leg would pay out now (after its exit fees)
    function lstValue() public view returns (uint256) {
        return lstLeg.totalValue();
    }

    function totalAssets() public view override returns (uint256) {
        return idleAssets() + stableValue() + lstValue();
    }

    // ---- deposits (SplitVault only) ----

    /// @dev shares are only minted by deposit, for the value it measurably added
    function maxMint(address) public pure override returns (uint256) {
        return 0;
    }

    /// @dev an estimate that stays at or under what deposit mints (rounding margin taken off)
    function previewDeposit(uint256 assets) public view override returns (uint256) {
        if (parked) return _convertToShares(assets, Math.Rounding.Floor);
        uint256 toLst = _lstPart(assets);
        uint256 added = assets - toLst + lstLeg.previewValueAdded(toLst);
        return _convertToShares(added > 2 ? added - 2 : 0, Math.Rounding.Floor);
    }

    function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256 shares) {
        if (msg.sender != depositor) revert NotDepositor();
        if (assets == 0) revert ZeroAmount();
        uint256 before = totalAssets();
        uint256 supply = totalSupply();
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);
        if (!parked) _deploy(assets);
        // the depositor gets shares for what its money is worth inside, not for what it sent
        uint256 added = totalAssets() - before;
        shares = Math.mulDiv(added, supply + 10 ** _decimalsOffset(), before + 1);
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    // ---- withdrawals ----

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256)
    {
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner) public override nonReentrant returns (uint256) {
        return super.redeem(shares, receiver, owner);
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        _free(assets);
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    // ---- the mix ----

    /// @notice The curator sets the liquid staking share (0 = leave liquid staking). Takes effect
    ///         on rebalanceMix().
    function setMix(uint16 bps) external onlyRole(CURATOR) {
        _setMix(bps);
    }

    /// @notice Moves money toward the curator's mix: idle money goes to work first, then the
    ///         legs are evened out. Anyone can call it (a keeper, or a button in the UI). A leg
    ///         move under MIN_MOVE_BPS of the pool is skipped, except that a mix of zero always
    ///         leaves liquid staking completely.
    function rebalanceMix() external nonReentrant returns (bool moved) {
        if (parked) return false;
        uint256 toStable = idleAssets();
        if (toStable != 0) _toStable(toStable);

        uint256 total = totalAssets();
        uint256 current = lstValue();
        uint256 target = (total * lstBps) / BPS;
        uint256 minMove = (total * MIN_MOVE_BPS) / BPS;
        uint256 toLst;
        if (target > current && target - current >= minMove) {
            toLst = target - current;
            _free(toLst);
            _toLst(toLst);
        } else if (current > target && (lstBps == 0 || current - target >= minMove)) {
            uint256 out = lstBps == 0 ? current : current - target;
            lstLeg.withdraw(out, address(this));
            _toStable(out);
            toStable += out;
        }
        moved = toLst != 0 || toStable != 0;
        if (moved) emit LegsRebalanced(toLst, toStable);
    }

    /// @notice Safety valve: pulls everything out of both legs and keeps it idle (the treasuries
    ///         can still be paid) until the admin resumes.
    function emergencyExit() external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        parked = true;
        emit Parked(true);
        _setMix(0);
        uint256 inLst = lstValue();
        if (inLst != 0) lstLeg.withdraw(inLst, address(this));
        uint256 s = stable.balanceOf(address(this));
        if (s != 0) stable.redeem(s, address(this), address(this));
    }

    /// @notice Ends an emergency exit; idle money goes back to work on the next rebalanceMix.
    function resume() external onlyRole(DEFAULT_ADMIN_ROLE) {
        parked = false;
        emit Parked(false);
    }

    // ---- internals ----

    function _setMix(uint16 bps) internal {
        if (bps > MAX_LST_BPS) revert InvalidMix();
        lstBps = bps;
        emit MixSet(bps);
    }

    function _lstPart(uint256 assets) internal view returns (uint256) {
        return (assets * lstBps) / BPS;
    }

    /// @dev puts newly deposited money to work in the curator's mix
    function _deploy(uint256 assets) internal {
        uint256 toLst = _lstPart(assets);
        if (assets - toLst != 0) _toStable(assets - toLst);
        if (toLst != 0) _toLst(toLst);
    }

    function _toStable(uint256 assets) internal {
        if (assets == 0) return;
        IERC20(asset()).forceApprove(address(stable), assets);
        stable.deposit(assets, address(this));
    }

    function _toLst(uint256 assets) internal {
        IERC20(asset()).forceApprove(address(lstLeg), assets);
        lstLeg.deposit(assets);
    }

    /// @dev makes sure `assets` sit idle here: takes from token staking first, then liquid staking
    function _free(uint256 assets) internal {
        uint256 idle = idleAssets();
        if (idle >= assets) return;
        uint256 need = assets - idle;
        uint256 fromStable = Math.min(need, stable.maxWithdraw(address(this)));
        if (fromStable != 0) {
            stable.withdraw(fromStable, address(this), address(this));
            need -= fromStable;
        }
        if (need != 0) lstLeg.withdraw(need, address(this));
    }
}
