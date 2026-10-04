// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MockUSD} from "./MockUSD.sol";

/// @notice Testnet stand-in for a yield strategy (a staking pool or a market-making vault).
///         A standard ERC-4626 vault over MockUSD whose share price rises at a simulated APR.
///         Real strategies (aPriori, Kuru, ...) plug into the SplitVault through the same
///         ERC-4626 interface, so swapping this mock out needs no vault changes.
/// @dev Yield is minted (MockUSD minter role) when someone touches the vault. Until then it is
///      counted virtually in `totalAssets`, so previews and conversions are always consistent.
///      `_decimalsOffset` adds virtual shares, which defeats the first-depositor inflation attack.
contract MockYieldVault is ERC4626, Ownable {
    uint256 public constant BPS = 10_000;
    /// @dev demo knob: lets the owner crank yield up so it is visible within minutes
    uint256 public constant MAX_APR_BPS = 1_000_000;

    MockUSD public immutable usd;
    uint256 public aprBps;
    uint64 public lastAccrual;

    event AprSet(uint256 aprBps);
    event Accrued(uint256 amount);

    error AprTooHigh();

    constructor(MockUSD usd_, uint256 aprBps_) ERC20("Jagomoko Yield Vault", "jYV") ERC4626(usd_) Ownable(msg.sender) {
        usd = usd_;
        _setApr(aprBps_);
        lastAccrual = uint64(block.timestamp);
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    /// @notice yield earned since the last accrual that has not been minted yet
    function pendingYield() public view returns (uint256) {
        return (usd.balanceOf(address(this)) * aprBps * (block.timestamp - lastAccrual)) / (BPS * 365 days);
    }

    function totalAssets() public view override returns (uint256) {
        return super.totalAssets() + pendingYield();
    }

    /// @notice Mints the pending yield. Anyone can call it; it can never exceed the APR formula.
    function accrue() public returns (uint256 minted) {
        minted = pendingYield();
        lastAccrual = uint64(block.timestamp);
        if (minted != 0) {
            usd.mint(address(this), minted);
            emit Accrued(minted);
        }
    }

    function setApr(uint256 aprBps_) external onlyOwner {
        accrue(); // a rate change never applies retroactively
        _setApr(aprBps_);
    }

    /// @notice Demo helper: add a lump of yield right now (the vault must be a MockUSD minter).
    function donateYield(uint256 amount) external onlyOwner {
        usd.mint(address(this), amount);
        emit Accrued(amount);
    }

    function _setApr(uint256 aprBps_) internal {
        if (aprBps_ > MAX_APR_BPS) revert AprTooHigh();
        aprBps = aprBps_;
        emit AprSet(aprBps_);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        accrue();
        super._deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
    {
        accrue();
        super._withdraw(caller, receiver, owner_, assets, shares);
    }
}
