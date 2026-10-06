// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {EnforcedOptionParam} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {TipSender} from "../src/TipSender.sol";
import {IPriceFeed} from "../src/interfaces/IPriceFeed.sol";

/// @notice Deploys the TipSender on a source chain (Sepolia by default) and points it at the
///         TipReceiver on Monad (read from deployments/10143.json, so run DeployV2 first):
///
///           forge script script/DeployTipSender.s.sol --rpc-url sepolia              (dry run)
///           forge script script/DeployTipSender.s.sol --rpc-url sepolia --broadcast
///
///         Then let the receiver accept it: SetTipPeer.s.sol on Monad.
///
///         Env: PRIVATE_KEY (needs a little Sepolia ETH). Another source chain works too, with
///         LZ_ENDPOINT and ETH_USD_FEED for that chain. Optional: USDC + USDC_USD_FEED to allow
///         a token as well. Writes deployments/<chainId>.json on a broadcast only.
contract DeployTipSender is Script {
    using OptionsBuilder for bytes;

    address constant SEPOLIA_ENDPOINT = 0x6EDCE65403992e310A62460808c4b910D972f10f;
    address constant SEPOLIA_ETH_USD = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
    /// @dev the current Monad testnet (the older 40204 entry is from before its reset)
    uint32 constant MONAD_TESTNET_EID = 40442;
    /// @dev gas for TipReceiver.lzReceive on Monad. The heaviest tip uses ~265k at Ethereum prices;
    ///      Monad charges more for cold accounts and storage (10,100 / 8,100 vs 2,600 / 2,100), so
    ///      this leaves a bit over 2x (CrossChainTip.t.sol checks the heaviest case fits in half)
    uint128 constant RECEIVE_GAS = 600_000;

    function run() external returns (TipSender sender) {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        require(!vm.exists(path) || !vm.keyExistsJson(vm.readFile(path), ".TipSender"), "TipSender is already deployed here");
        address receiver = vm.parseJsonAddress(vm.readFile("deployments/10143.json"), ".TipReceiver");

        sender = _deploy(vm.envUint("PRIVATE_KEY"), receiver);

        // the feed is live and LayerZero can price the route: a $5-ish quote must work
        (uint256 fee, uint256 usdAmount) = sender.quote(sender.NATIVE(), 0.002 ether, 1, "gg");
        console2.log("TipSender", address(sender));
        console2.log("0.002 ETH is worth (USD, 6 decimals)", usdAmount);
        console2.log("LayerZero fee (wei)", fee);

        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) && !vm.isContext(VmSafe.ForgeContext.ScriptResume)) {
            console2.log("Dry run: nothing was sent and", path, "was not changed");
            return sender;
        }
        _write(path, receiver, address(sender));
        console2.log("Deployment written to", path);
    }

    function _deploy(uint256 pk, address receiver) internal returns (TipSender sender) {
        address endpoint = vm.envOr("LZ_ENDPOINT", SEPOLIA_ENDPOINT);
        address ethUsd = vm.envOr("ETH_USD_FEED", SEPOLIA_ETH_USD);
        address usdc = vm.envOr("USDC", address(0));
        address usdcUsd = vm.envOr("USDC_USD_FEED", address(0));
        require(endpoint.code.length != 0, "no LayerZero endpoint at LZ_ENDPOINT on this chain");
        require(ethUsd.code.length != 0, "no price feed at ETH_USD_FEED on this chain");

        vm.startBroadcast(pk);
        sender = new TipSender(endpoint, MONAD_TESTNET_EID, vm.addr(pk));
        sender.setAsset(sender.NATIVE(), IPriceFeed(ethUsd));
        if (usdc != address(0)) sender.setAsset(usdc, IPriceFeed(usdcUsd));
        sender.setPeer(MONAD_TESTNET_EID, bytes32(uint256(uint160(receiver))));
        EnforcedOptionParam[] memory opts = new EnforcedOptionParam[](1);
        opts[0] = EnforcedOptionParam({
            eid: MONAD_TESTNET_EID,
            msgType: sender.SEND(),
            options: OptionsBuilder.newOptions().addExecutorLzReceiveOption(RECEIVE_GAS, 0)
        });
        sender.setEnforcedOptions(opts);
        vm.stopBroadcast();
    }

    function _write(string memory path, address receiver, address sender) internal {
        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "startBlock", block.number);
        vm.serializeUint(o, "dstEid", MONAD_TESTNET_EID);
        vm.serializeAddress(o, "TipReceiver", receiver);
        vm.writeJson(vm.serializeAddress(o, "TipSender", sender), path);
    }
}
