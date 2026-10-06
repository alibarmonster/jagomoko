// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Testnet stand-in for a DEX with one market: mUSD <-> mMON.
///
///         It trades at a price the owner sets (a stand-in for an oracle such as Chainlink or Pyth)
///         out of the inventory the owner seeded, minus a fee. Because the price does not come from
///         reserves, nobody can move it with a big swap, so the pool's liquid staking leg can value
///         its position with `quote` safely. On mainnet this is a real DEX route (Kuru, Uniswap)
///         with a minimum output checked against an oracle.
/// @dev Assumes mUSD has 6 decimals and mMON 18: usd = mon * price / 1e20 (price has 8 decimals).
contract MokoSwap is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 100;
    /// @dev 10^(18 + 8 - 6): converts mMON wei times an 8-decimal price into mUSD units
    uint256 internal constant SCALE = 1e20;

    IERC20 public immutable usd;
    IERC20 public immutable mon;
    /// @notice USD per 1 MON, 8 decimals (5_000_000 = $0.05)
    uint256 public price;
    uint256 public feeBps;

    event Swapped(address indexed trader, address indexed tokenIn, uint256 amountIn, uint256 amountOut, address to);
    event PriceSet(uint256 price);
    event FeeSet(uint256 feeBps);
    event InventoryWithdrawn(address indexed token, address indexed to, uint256 amount);

    error UnknownToken();
    error ZeroAmount();
    error InvalidPrice();
    error FeeTooHigh();
    error SlippageTooHigh(uint256 out, uint256 minOut);
    error NotEnoughInventory();

    constructor(IERC20 usd_, IERC20 mon_, uint256 price_, uint256 feeBps_) Ownable(msg.sender) {
        usd = usd_;
        mon = mon_;
        _setPrice(price_);
        _setFee(feeBps_);
    }

    /// @notice What `amountIn` of `tokenIn` buys right now, after the fee (rounded down).
    function quote(address tokenIn, uint256 amountIn) public view returns (uint256 out) {
        uint256 gross;
        if (tokenIn == address(usd)) gross = Math.mulDiv(amountIn, SCALE, price);
        else if (tokenIn == address(mon)) gross = Math.mulDiv(amountIn, price, SCALE);
        else revert UnknownToken();
        out = Math.mulDiv(gross, BPS - feeBps, BPS);
    }

    /// @notice The smallest input of `tokenIn` that buys at least `amountOut` (rounded up).
    function quoteIn(address tokenIn, uint256 amountOut) public view returns (uint256 amountIn) {
        uint256 gross = Math.mulDiv(amountOut, BPS, BPS - feeBps, Math.Rounding.Ceil);
        if (tokenIn == address(usd)) amountIn = Math.mulDiv(gross, price, SCALE, Math.Rounding.Ceil);
        else if (tokenIn == address(mon)) amountIn = Math.mulDiv(gross, SCALE, price, Math.Rounding.Ceil);
        else revert UnknownToken();
    }

    function swap(address tokenIn, uint256 amountIn, uint256 minOut, address to)
        external
        nonReentrant
        returns (uint256 out)
    {
        if (amountIn == 0) revert ZeroAmount();
        out = quote(tokenIn, amountIn);
        if (out < minOut) revert SlippageTooHigh(out, minOut);
        IERC20 tokenOut = tokenIn == address(usd) ? mon : usd;
        if (tokenOut.balanceOf(address(this)) < out) revert NotEnoughInventory();
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        tokenOut.safeTransfer(to, out);
        emit Swapped(msg.sender, tokenIn, amountIn, out, to);
    }

    function setPrice(uint256 price_) external onlyOwner {
        _setPrice(price_);
    }

    function setFee(uint256 feeBps_) external onlyOwner {
        _setFee(feeBps_);
    }

    /// @notice Takes inventory back out (seeding is a plain transfer or mint to this contract).
    function withdrawInventory(IERC20 token, address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
        emit InventoryWithdrawn(address(token), to, amount);
    }

    function _setPrice(uint256 price_) internal {
        if (price_ == 0) revert InvalidPrice();
        price = price_;
        emit PriceSet(price_);
    }

    function _setFee(uint256 feeBps_) internal {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = feeBps_;
        emit FeeSet(feeBps_);
    }
}
