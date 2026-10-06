// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {OAppSender, OAppCore, MessagingFee, MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppSender.sol";
import {OAppOptionsType3} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OAppOptionsType3.sol";
import {IPriceFeed} from "./interfaces/IPriceFeed.sol";
import {TipMessage} from "./libs/TipMessage.sol";

/// @notice Tip a jagomoko creator from another chain (Sepolia first). The viewer pays here in an
///         allowed asset; the tip is priced in USD with a Chainlink feed and sent over LayerZero v2
///         to the TipReceiver on Monad, which credits it to the creator's split. The memo travels
///         with it, so it shows up in the stream alert.
///
///         Only assets the owner allowed (each with its price feed) can be sent; everything else
///         reverts. The paid asset stays in this contract: on testnet the Monad side mints
///         practice dollars against it. On mainnet the money itself would travel (USDC or USDT0
///         as an OFT with a compose message) instead of being held here.
contract TipSender is OAppSender, OAppOptionsType3, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev message type the enforced options (the receiver's gas) are set for
    uint16 public constant SEND = 1;
    /// @notice stands for the chain's native coin (ETH on Sepolia)
    address public constant NATIVE = address(0);
    uint256 public constant MAX_MEMO_BYTES = 200;
    /// @dev the owner can never raise the per-tip limit above this (USD, 6 decimals)
    uint256 public constant MAX_TIP_CEILING = 1_000e6;

    struct Asset {
        IPriceFeed feed;
        /// @dev usd (6 decimals) = amount * price / scale
        uint256 scale;
    }

    uint32 public immutable dstEid;
    mapping(address => Asset) public assets;
    uint256 public minUsd = 1e6;
    uint256 public maxUsd = 100e6;
    uint256 public maxPriceAge = 3 hours;

    event AssetSet(address indexed token, address feed);
    event LimitsSet(uint256 minUsd, uint256 maxUsd, uint256 maxPriceAge);
    event TipSent(
        bytes32 indexed guid,
        uint256 indexed creatorId,
        address indexed donor,
        address asset,
        uint256 amount,
        uint256 usdAmount,
        string memo
    );
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    error AssetNotAllowed(address token);
    error BadDecimals();
    error BadPrice();
    error StalePrice(uint256 updatedAt);
    error ZeroAmount();
    error MemoTooLong();
    error TipTooSmall(uint256 usdAmount, uint256 minUsd);
    error TipTooLarge(uint256 usdAmount, uint256 maxUsd);
    error FeeMissing();
    error InvalidLimits();
    error TransferFailed();
    error NoGasOption();

    constructor(address endpoint_, uint32 dstEid_, address owner_) OAppCore(endpoint_, owner_) Ownable(owner_) {
        dstEid = dstEid_;
    }

    // ---- reads ----

    /// @notice The USD value (6 decimals) of `amount` of `token` at the feed's latest price.
    function usdValue(address token, uint256 amount) public view returns (uint256) {
        Asset memory a = assets[token];
        if (address(a.feed) == address(0)) revert AssetNotAllowed(token);
        (, int256 answer,, uint256 updatedAt,) = a.feed.latestRoundData();
        if (answer <= 0) revert BadPrice();
        if (updatedAt > block.timestamp || block.timestamp - updatedAt > maxPriceAge) revert StalePrice(updatedAt);
        return Math.mulDiv(amount, uint256(answer), a.scale);
    }

    /// @notice The LayerZero fee (in the native coin) for a tip, and what it is worth in USD.
    ///         For a native tip, send msg.value = amount + nativeFee.
    function quote(address token, uint256 amount, uint256 creatorId, string calldata memo)
        external
        view
        returns (uint256 nativeFee, uint256 usdAmount)
    {
        usdAmount = usdValue(token, amount);
        bytes memory message = TipMessage.encode(creatorId, msg.sender, usdAmount, memo);
        nativeFee = _quote(dstEid, message, _sendOptions(), false).nativeFee;
    }

    // ---- tipping ----

    /// @notice Tips creator `creatorId` on Monad. Native: msg.value = amount + the quoted fee
    ///         (any fee overpaid is refunded by the endpoint). Token: approve `amount` first and
    ///         send the fee as msg.value.
    function tip(address token, uint256 amount, uint256 creatorId, string calldata memo)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (MessagingReceipt memory receipt)
    {
        if (amount == 0) revert ZeroAmount();
        if (bytes(memo).length > MAX_MEMO_BYTES) revert MemoTooLong();
        uint256 usdAmount = usdValue(token, amount);
        if (usdAmount < minUsd) revert TipTooSmall(usdAmount, minUsd);
        if (usdAmount > maxUsd) revert TipTooLarge(usdAmount, maxUsd);

        uint256 fee;
        if (token == NATIVE) {
            if (msg.value <= amount) revert FeeMissing();
            fee = msg.value - amount;
        } else {
            fee = msg.value;
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        receipt = _lzSend(
            dstEid,
            TipMessage.encode(creatorId, msg.sender, usdAmount, memo),
            _sendOptions(),
            MessagingFee(fee, 0),
            payable(msg.sender)
        );
        emit TipSent(receipt.guid, creatorId, msg.sender, token, amount, usdAmount, memo);
    }

    /// @dev the receiver's gas, set by the owner as enforced options; without them the message
    ///      could not be executed on Monad, so tipping refuses to start
    function _sendOptions() internal view returns (bytes memory options) {
        options = enforcedOptions[dstEid][SEND];
        if (options.length == 0) revert NoGasOption();
    }

    /// @dev msg.value also carries the tip itself when it is paid in the native coin, so only the
    ///      fee is handed to the endpoint (tip() already checked that msg.value covers both)
    function _payNative(uint256 nativeFee) internal pure override returns (uint256) {
        return nativeFee;
    }

    // ---- owner ----

    /// @notice Allows `token` (NATIVE for the coin) priced by `feed`; a zero feed removes it.
    function setAsset(address token, IPriceFeed feed) external onlyOwner {
        if (address(feed) == address(0)) {
            delete assets[token];
            emit AssetSet(token, address(0));
            return;
        }
        uint256 decimals = uint256(token == NATIVE ? 18 : IERC20Metadata(token).decimals()) + feed.decimals();
        if (decimals < 6) revert BadDecimals();
        assets[token] = Asset({feed: feed, scale: 10 ** (decimals - 6)});
        emit AssetSet(token, address(feed));
    }

    function setLimits(uint256 minUsd_, uint256 maxUsd_, uint256 maxPriceAge_) external onlyOwner {
        if (minUsd_ == 0 || minUsd_ > maxUsd_ || maxUsd_ > MAX_TIP_CEILING || maxPriceAge_ == 0) revert InvalidLimits();
        minUsd = minUsd_;
        maxUsd = maxUsd_;
        maxPriceAge = maxPriceAge_;
        emit LimitsSet(minUsd_, maxUsd_, maxPriceAge_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Takes out tips held here (NATIVE for the coin).
    function withdraw(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == NATIVE) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
        emit Withdrawn(token, to, amount);
    }
}
