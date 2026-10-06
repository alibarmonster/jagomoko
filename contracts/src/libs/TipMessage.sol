// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The cross-chain tip payload, shared by TipSender (source chain) and TipReceiver (Monad).
/// @dev `usdAmount` is in mUSD units (6 decimals), already priced on the source chain. `donor` is
///      the address that paid there; the same address is credited on Monad.
library TipMessage {
    function encode(uint256 creatorId, address donor, uint256 usdAmount, string memory memo)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(creatorId, donor, usdAmount, memo);
    }

    function decode(bytes calldata message)
        internal
        pure
        returns (uint256 creatorId, address donor, uint256 usdAmount, string memory memo)
    {
        return abi.decode(message, (uint256, address, uint256, string));
    }
}
