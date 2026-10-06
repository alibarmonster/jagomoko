// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TipReceiver} from "../src/TipReceiver.sol";

/// @notice Lets the TipReceiver on Monad accept messages from a TipSender (the last step after
///         DeployV2 on Monad and DeployTipSender on the source chain):
///
///           forge script script/SetTipPeer.s.sol --rpc-url monad_testnet --broadcast
///
///         Env: PRIVATE_KEY (the TipReceiver owner). Defaults to Sepolia; for another source
///         chain set SRC_CHAIN_ID (its deployment file) and SRC_EID (its LayerZero endpoint id).
contract SetTipPeer is Script {
    uint32 constant SEPOLIA_EID = 40161;

    function run() external {
        uint256 srcChainId = vm.envOr("SRC_CHAIN_ID", uint256(11155111));
        uint32 srcEid = uint32(vm.envOr("SRC_EID", uint256(SEPOLIA_EID)));
        TipReceiver receiver =
            TipReceiver(vm.parseJsonAddress(vm.readFile("deployments/10143.json"), ".TipReceiver"));
        string memory srcJson = vm.readFile(string.concat("deployments/", vm.toString(srcChainId), ".json"));
        address sender = vm.parseJsonAddress(srcJson, ".TipSender");
        require(vm.parseJsonAddress(srcJson, ".TipReceiver") == address(receiver), "that TipSender points at another receiver");

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        receiver.setPeer(srcEid, bytes32(uint256(uint160(sender))));
        vm.stopBroadcast();

        require(receiver.peers(srcEid) == bytes32(uint256(uint160(sender))), "peer not set");
        console2.log("TipReceiver", address(receiver));
        console2.log("now accepts TipSender", sender);
        console2.log("from LayerZero eid", srcEid);
    }
}
