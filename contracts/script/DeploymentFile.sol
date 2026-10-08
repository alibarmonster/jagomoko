// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

/// @notice Shared by the scripts that add contracts to a deployment that is already live: they
///         rewrite deployments/<chainId>.json with the new addresses and keep every other value,
///         whichever order they run in.
abstract contract DeploymentFile is Script {
    /// @dev every contract key a Monad deployment file can hold, in the order it is written
    function _knownKeys() internal pure returns (string[17] memory) {
        return [
            "MockUSD",
            "MockYieldVault",
            "CreatorRegistry",
            "Character",
            "SplitVault",
            "Jury",
            "QuestEscrow",
            "PredictionBattle",
            "CommunityTreasury",
            "ClipBoard",
            "MockMON",
            "MokoSwap",
            "MockLST",
            "LstStrategy",
            "CommunityPoolVault",
            "TipReceiver",
            "PracticeFaucet"
        ];
    }

    function _deploymentPath() internal view returns (string memory) {
        return string.concat("deployments/", vm.toString(block.chainid), ".json");
    }

    /// @dev true only when the script really sends transactions (not on a dry run)
    function _broadcasting() internal view returns (bool) {
        return vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume);
    }

    /// @dev rewrites `path` with chainId, startBlock and every known key already in `json`, plus
    ///      `keys` set to `values` (a new value wins over an old one)
    function _record(string memory json, string memory path, string[] memory keys, address[] memory values) internal {
        string memory o = "deployment";
        vm.serializeUint(o, "chainId", vm.parseJsonUint(json, ".chainId"));
        string memory out = vm.serializeUint(o, "startBlock", vm.parseJsonUint(json, ".startBlock"));
        string[17] memory known = _knownKeys();
        for (uint256 i; i < known.length; ++i) {
            string memory key = string.concat(".", known[i]);
            if (!vm.keyExistsJson(json, key) || _contains(keys, known[i])) continue;
            out = vm.serializeAddress(o, known[i], vm.parseJsonAddress(json, key));
        }
        for (uint256 i; i < keys.length; ++i) {
            out = vm.serializeAddress(o, keys[i], values[i]);
        }
        vm.writeJson(out, path);
    }

    function _contains(string[] memory list, string memory item) private pure returns (bool) {
        for (uint256 i; i < list.length; ++i) {
            if (keccak256(bytes(list[i])) == keccak256(bytes(item))) return true;
        }
        return false;
    }
}
