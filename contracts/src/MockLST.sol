// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MockMON} from "./MockMON.sol";

/// @notice Testnet stand-in for a Monad liquid staking token (like aPriori's aprMON or Magma's
///         gMON): stake mMON, get stMON, whose value in mMON rises with simulated staking rewards.
///
///         Leaving has two doors, as on the real protocols:
///         - instantRedeem: paid right away from the liquidity buffer, minus a small fee that stays
///           with the remaining stakers;
///         - requestRedeem + claim: no fee, but the mMON only unlocks after the unbonding period.
///         The plain ERC-4626 withdraw/redeem are closed, because a real LST cannot pay out
///         staked MON synchronously without one of those two.
/// @dev Rewards are minted (MockMON minter role) when someone touches the vault and are counted
///      virtually in totalAssets until then. mMON waiting to be claimed is set aside and earns
///      nothing. `_decimalsOffset` adds virtual shares against the first-depositor attack.
contract MockLST is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    /// @dev demo knob: lets the owner speed rewards up so they show within minutes
    uint256 public constant MAX_APR_BPS = 1_000_000;
    uint256 public constant MAX_INSTANT_FEE_BPS = 100;
    uint64 public constant MAX_UNBONDING = 7 days;

    MockMON public immutable mon;
    uint256 public aprBps;
    uint256 public instantFeeBps;
    uint64 public unbondingPeriod;
    uint64 public lastAccrual;
    /// @dev mMON promised to pending unstake requests; not staked, earns nothing
    uint256 public reserved;

    struct Request {
        address receiver;
        uint64 unlockAt;
        bool claimed;
        uint256 assets;
    }

    uint256 public requestCount;
    mapping(uint256 => Request) public requests;

    event AprSet(uint256 aprBps);
    event InstantFeeSet(uint256 feeBps);
    event UnbondingSet(uint64 period);
    event Accrued(uint256 amount);
    event InstantRedeemed(address indexed owner, address indexed receiver, uint256 shares, uint256 assets, uint256 fee);
    event UnstakeRequested(uint256 indexed requestId, address indexed owner, address indexed receiver, uint256 shares, uint256 assets, uint64 unlockAt);
    event UnstakeClaimed(uint256 indexed requestId, address indexed receiver, uint256 assets);

    error AprTooHigh();
    error FeeTooHigh();
    error UnbondingTooLong();
    error ZeroShares();
    error UnknownRequest();
    error StillUnbonding(uint64 unlockAt);
    error AlreadyClaimed();
    error InsufficientOutput(uint256 assets, uint256 minAssets);

    constructor(MockMON mon_, uint256 aprBps_, uint256 instantFeeBps_, uint64 unbondingPeriod_)
        ERC20("Staked mock MON", "stMON")
        ERC4626(IERC20(address(mon_)))
        Ownable(msg.sender)
    {
        mon = mon_;
        lastAccrual = uint64(block.timestamp);
        _setApr(aprBps_);
        _setInstantFee(instantFeeBps_);
        _setUnbonding(unbondingPeriod_);
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    // ---- value ----

    /// @notice mMON actually staked (everything here except what waits to be claimed)
    function staked() public view returns (uint256) {
        return mon.balanceOf(address(this)) - reserved;
    }

    /// @notice rewards earned since the last accrual that have not been minted yet
    function pendingRewards() public view returns (uint256) {
        return (staked() * aprBps * (block.timestamp - lastAccrual)) / (BPS * 365 days);
    }

    function totalAssets() public view override returns (uint256) {
        return staked() + pendingRewards();
    }

    /// @notice Mints the pending rewards. Anyone can call it; it never exceeds the APR formula.
    function accrue() public returns (uint256 minted) {
        minted = pendingRewards();
        lastAccrual = uint64(block.timestamp);
        if (minted != 0) {
            mon.mint(address(this), minted);
            emit Accrued(minted);
        }
    }

    // ---- leaving ----

    /// @dev the synchronous ERC-4626 exits are closed: use instantRedeem or requestRedeem
    function maxWithdraw(address) public pure override returns (uint256) {
        return 0;
    }

    function maxRedeem(address) public pure override returns (uint256) {
        return 0;
    }

    /// @notice mMON that `shares` pay out through the instant door right now (after the fee)
    function previewInstantRedeem(uint256 shares) public view returns (uint256) {
        return Math.mulDiv(previewRedeem(shares), BPS - instantFeeBps, BPS);
    }

    /// @notice the fewest shares that pay out at least `assets` mMON through the instant door
    function previewInstantWithdraw(uint256 assets) public view returns (uint256) {
        return previewWithdraw(Math.mulDiv(assets, BPS, BPS - instantFeeBps, Math.Rounding.Ceil));
    }

    /// @notice Burns `shares` and pays their mMON right away, minus the instant fee (which stays
    ///         in the vault, so it goes to everyone still staked).
    function instantRedeem(uint256 shares, uint256 minAssets, address receiver)
        external
        nonReentrant
        returns (uint256 assets)
    {
        if (shares == 0) revert ZeroShares();
        accrue();
        uint256 gross = previewRedeem(shares);
        assets = Math.mulDiv(gross, BPS - instantFeeBps, BPS);
        if (assets < minAssets) revert InsufficientOutput(assets, minAssets);
        _burn(msg.sender, shares);
        IERC20(asset()).safeTransfer(receiver, assets);
        emit InstantRedeemed(msg.sender, receiver, shares, assets, gross - assets);
    }

    /// @notice Burns `shares` now and sets their mMON aside; `claim` pays it after the unbonding
    ///         period. No fee, but it stops earning from this moment.
    function requestRedeem(uint256 shares, address receiver) external nonReentrant returns (uint256 id) {
        if (shares == 0) revert ZeroShares();
        accrue();
        uint256 assets = previewRedeem(shares);
        _burn(msg.sender, shares);
        reserved += assets;
        id = ++requestCount;
        uint64 unlockAt = uint64(block.timestamp) + unbondingPeriod;
        requests[id] = Request({receiver: receiver, unlockAt: unlockAt, claimed: false, assets: assets});
        emit UnstakeRequested(id, msg.sender, receiver, shares, assets, unlockAt);
    }

    function claim(uint256 id) external nonReentrant returns (uint256 assets) {
        Request storage r = requests[id];
        if (r.receiver == address(0)) revert UnknownRequest();
        if (r.claimed) revert AlreadyClaimed();
        if (block.timestamp < r.unlockAt) revert StillUnbonding(r.unlockAt);
        accrue(); // settle rewards on the staked part before it shrinks
        r.claimed = true;
        assets = r.assets;
        reserved -= assets;
        IERC20(asset()).safeTransfer(r.receiver, assets);
        emit UnstakeClaimed(id, r.receiver, assets);
    }

    // ---- owner knobs ----

    function setApr(uint256 aprBps_) external onlyOwner {
        accrue(); // a rate change never applies retroactively
        _setApr(aprBps_);
    }

    function setInstantFee(uint256 feeBps_) external onlyOwner {
        _setInstantFee(feeBps_);
    }

    function setUnbondingPeriod(uint64 period) external onlyOwner {
        _setUnbonding(period);
    }

    /// @notice Demo helper: a lump of staking rewards right now (this vault must be a MockMON minter).
    function donateRewards(uint256 amount) external onlyOwner {
        accrue();
        mon.mint(address(this), amount);
        emit Accrued(amount);
    }

    function _setApr(uint256 aprBps_) internal {
        if (aprBps_ > MAX_APR_BPS) revert AprTooHigh();
        aprBps = aprBps_;
        emit AprSet(aprBps_);
    }

    function _setInstantFee(uint256 feeBps_) internal {
        if (feeBps_ > MAX_INSTANT_FEE_BPS) revert FeeTooHigh();
        instantFeeBps = feeBps_;
        emit InstantFeeSet(feeBps_);
    }

    function _setUnbonding(uint64 period) internal {
        if (period > MAX_UNBONDING) revert UnbondingTooLong();
        unbondingPeriod = period;
        emit UnbondingSet(period);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        accrue();
        super._deposit(caller, receiver, assets, shares);
    }
}
