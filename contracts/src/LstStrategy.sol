// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MokoSwap} from "./MokoSwap.sol";
import {MockLST} from "./MockLST.sol";

/// @notice The Community Pool's liquid staking leg. It turns mUSD into staked MON and back:
///
///           in : mUSD --MokoSwap--> mMON --stake--> stMON
///           out: stMON --instantRedeem--> mMON --MokoSwap--> mUSD
///
///         Leaving goes through the LST's instant door, so the pool can always pay the treasury
///         right away instead of waiting for unbonding. The position is valued at what that exit
///         would pay now (after both fees), so the pool never counts money it cannot hand back.
/// @dev Only the pool may move money. The pool and this leg point at each other, so the pool is
///      bound once after both exist.
contract LstStrategy {
    using SafeERC20 for IERC20;

    IERC20 public immutable usd;
    IERC20 public immutable mon;
    MokoSwap public immutable swap;
    MockLST public immutable lst;
    address public immutable deployer;
    address public pool;

    event Bound(address indexed pool);
    event Staked(uint256 usdIn, uint256 monStaked, uint256 shares);
    event Unstaked(uint256 usdOut, uint256 monUnstaked, uint256 shares);

    error NotPool();
    error AlreadyBound();
    error ZeroAmount();
    error NotEnoughValue(uint256 available, uint256 wanted);

    constructor(IERC20 usd_, MokoSwap swap_, MockLST lst_) {
        usd = usd_;
        mon = IERC20(lst_.asset());
        swap = swap_;
        lst = lst_;
        deployer = msg.sender;
        require(address(swap_.usd()) == address(usd_) && address(swap_.mon()) == address(mon), "LstStrategy: wrong market");
    }

    modifier onlyPool() {
        if (msg.sender != pool) revert NotPool();
        _;
    }

    function bind(address pool_) external {
        if (msg.sender != deployer || pool != address(0)) revert AlreadyBound();
        pool = pool_;
        emit Bound(pool_);
    }

    // ---- value ----

    /// @notice stMON held
    function shares() public view returns (uint256) {
        return lst.balanceOf(address(this));
    }

    /// @notice mMON the stake is worth at the LST's own rate (before any exit fee)
    function stakedMon() external view returns (uint256) {
        return lst.previewRedeem(shares());
    }

    /// @notice mUSD this leg would hand back if it left completely right now
    function totalValue() public view returns (uint256 value) {
        value = usd.balanceOf(address(this));
        uint256 s = shares();
        if (s != 0) {
            uint256 monOut = lst.previewInstantRedeem(s);
            if (monOut != 0) value += swap.quote(address(mon), monOut);
        }
    }

    /// @notice What depositing `usdIn` adds to totalValue (both swaps and the exit fee taken out)
    function previewValueAdded(uint256 usdIn) external view returns (uint256) {
        if (usdIn == 0) return 0;
        uint256 monIn = swap.quote(address(usd), usdIn);
        uint256 monOut = lst.previewInstantRedeem(lst.previewDeposit(monIn));
        return monOut == 0 ? 0 : swap.quote(address(mon), monOut);
    }

    // ---- moving money (pool only) ----

    /// @notice Pulls `usdIn` from the pool, buys mMON and stakes it.
    function deposit(uint256 usdIn) external onlyPool {
        if (usdIn == 0) revert ZeroAmount();
        usd.safeTransferFrom(msg.sender, address(this), usdIn);
        usd.forceApprove(address(swap), usdIn);
        uint256 monIn = swap.swap(address(usd), usdIn, swap.quote(address(usd), usdIn), address(this));
        mon.forceApprove(address(lst), monIn);
        uint256 minted = lst.deposit(monIn, address(this));
        emit Staked(usdIn, monIn, minted);
    }

    /// @notice Sends exactly `usdOut` to `to`, unstaking through the instant door as needed.
    ///         Asking for everything (totalValue) exits the whole position.
    function withdraw(uint256 usdOut, address to) external onlyPool {
        if (usdOut == 0) revert ZeroAmount();
        uint256 idle = usd.balanceOf(address(this));
        if (idle < usdOut) {
            uint256 held = shares();
            uint256 burn = held;
            // asking for everything burns every share: the LST's instant fee stays with whoever is
            // still staked, which may be this leg, so a partial exit could leave value behind
            if (usdOut < totalValue()) {
                // the fewest stMON whose instant exit, sold, covers the shortfall
                burn = lst.previewInstantWithdraw(swap.quoteIn(address(mon), usdOut - idle));
                if (burn > held) burn = held;
            }
            if (burn != 0) {
                uint256 monOut = lst.instantRedeem(burn, 0, address(this));
                uint256 got;
                if (monOut != 0) {
                    mon.forceApprove(address(swap), monOut);
                    got = swap.swap(address(mon), monOut, swap.quote(address(mon), monOut), address(this));
                }
                emit Unstaked(got, monOut, burn);
            }
            idle = usd.balanceOf(address(this));
            if (idle < usdOut) revert NotEnoughValue(idle, usdOut);
        }
        usd.safeTransfer(to, usdOut);
    }
}
