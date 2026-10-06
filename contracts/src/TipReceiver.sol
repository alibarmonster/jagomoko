// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {OAppReceiver, OAppCore, Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import {MockUSD} from "./MockUSD.sol";
import {SplitVault} from "./SplitVault.sol";
import {TipMessage} from "./libs/TipMessage.sol";

/// @notice The Monad end of a cross-chain tip. LayerZero delivers a TipSender message here; this
///         mints the tip's USD value in practice dollars and deposits it into the creator's split
///         with depositFor, so the tip, its memo and the stream alert are credited to the address
///         that paid on the source chain.
///
///         It never reverts on a bad tip, so no message gets stuck:
///         - over a limit: nothing is minted (the source chain still holds the money) -> TipBounced;
///         - the deposit fails (say, an unknown creator): the dollars go to the donor's own address
///           on Monad instead -> TipBounced.
/// @dev Needs the MockUSD minter role and the SplitVault DEPOSIT_RELAYER role. Every message comes
///      through the LayerZero endpoint from a peer the owner set (OAppReceiver checks both).
contract TipReceiver is OAppReceiver {
    using SafeERC20 for IERC20;

    /// @dev the owner can never raise the per-tip limit above this (USD, 6 decimals)
    uint256 public constant MAX_TIP_CEILING = 1_000e6;
    uint8 public constant BOUNCE_LIMIT = 1;
    uint8 public constant BOUNCE_DEPOSIT = 2;

    MockUSD public immutable usd;
    SplitVault public immutable vault;

    uint256 public maxTipUsd = 100e6;
    uint256 public dailyCapUsd = 1_000e6;
    /// @dev UTC day of `mintedToday`
    uint256 public day;
    uint256 public mintedToday;

    /// @dev emitted before the deposit, so in the same transaction it comes before Deposited
    event CrossChainTip(
        bytes32 indexed guid, uint32 indexed srcEid, address indexed donor, uint256 creatorId, uint256 amount
    );
    event TipBounced(
        bytes32 indexed guid, uint32 indexed srcEid, address indexed donor, uint256 creatorId, uint256 amount, uint8 reason
    );
    event LimitsSet(uint256 maxTipUsd, uint256 dailyCapUsd);

    error InvalidLimits();

    constructor(address endpoint_, MockUSD usd_, SplitVault vault_, address owner_)
        OAppCore(endpoint_, owner_)
        Ownable(owner_)
    {
        require(address(vault_.token()) == address(usd_), "TipReceiver: vault uses another token");
        usd = usd_;
        vault = vault_;
        // the vault pulls each tip right after it is minted; one standing approval saves gas on
        // every delivery (nothing stays here between messages)
        IERC20(address(usd_)).forceApprove(address(vault_), type(uint256).max);
    }

    function _lzReceive(Origin calldata origin, bytes32 guid, bytes calldata message, address, bytes calldata)
        internal
        override
    {
        (uint256 creatorId, address donor, uint256 amount, string memory memo) = TipMessage.decode(message);
        if (amount == 0 || amount > maxTipUsd || !_useDailyCap(amount)) {
            emit TipBounced(guid, origin.srcEid, donor, creatorId, amount, BOUNCE_LIMIT);
            return;
        }

        emit CrossChainTip(guid, origin.srcEid, donor, creatorId, amount);
        usd.mint(address(this), amount);
        try vault.depositFor(creatorId, amount, donor, memo) {}
        catch {
            IERC20(address(usd)).safeTransfer(donor, amount);
            emit TipBounced(guid, origin.srcEid, donor, creatorId, amount, BOUNCE_DEPOSIT);
        }
    }

    /// @dev counts `amount` against today's cap; false (and nothing counted) if it would go over
    function _useDailyCap(uint256 amount) internal returns (bool) {
        uint256 today = block.timestamp / 1 days;
        if (today != day) {
            day = today;
            mintedToday = 0;
        }
        if (mintedToday + amount > dailyCapUsd) return false;
        mintedToday += amount;
        return true;
    }

    function setLimits(uint256 maxTipUsd_, uint256 dailyCapUsd_) external onlyOwner {
        if (maxTipUsd_ == 0 || maxTipUsd_ > MAX_TIP_CEILING || dailyCapUsd_ < maxTipUsd_) revert InvalidLimits();
        maxTipUsd = maxTipUsd_;
        dailyCapUsd = dailyCapUsd_;
        emit LimitsSet(maxTipUsd_, dailyCapUsd_);
    }
}
