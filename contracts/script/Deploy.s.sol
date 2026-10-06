// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StreamQuestDeployer} from "./StreamQuestDeployer.sol";
import {TipReceiver} from "../src/TipReceiver.sol";

/// @notice forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
///         Env: PRIVATE_KEY (deployer), DEMO_MODE=true to let the deployer
///         grant XP for seeding a demo (never enable on a real deployment), LZ_ENDPOINT to add
///         the cross-chain TipReceiver (skipped without it, e.g. on a local anvil).
contract Deploy is Script, StreamQuestDeployer {
    function run() external returns (System memory s) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        bool demo = vm.envOr("DEMO_MODE", false);

        Config memory cfg = defaultConfig();
        if (demo) {
            cfg.challengeWindow = 2 minutes; // snappier live demo
            cfg.juryVoteWindow = 5 minutes;
        }

        vm.startBroadcast(pk);
        s = _deploy(deployer, cfg);
        if (demo) s.character.grantRole(s.character.XP_GRANTER(), deployer);
        Pool memory p = _deployPool(s.usd, s.strategy, s.vault, deployer, defaultPoolConfig());
        address endpoint = vm.envOr("LZ_ENDPOINT", address(0));
        TipReceiver receiver;
        if (endpoint != address(0)) receiver = _deployTipReceiver(endpoint, s.usd, s.vault, deployer);
        vm.stopBroadcast();

        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "startBlock", block.number);
        vm.serializeAddress(o, "MockUSD", address(s.usd));
        vm.serializeAddress(o, "MockYieldVault", address(s.strategy));
        vm.serializeAddress(o, "CreatorRegistry", address(s.registry));
        vm.serializeAddress(o, "Character", address(s.character));
        vm.serializeAddress(o, "SplitVault", address(s.vault));
        vm.serializeAddress(o, "Jury", address(s.jury));
        vm.serializeAddress(o, "QuestEscrow", address(s.quests));
        vm.serializeAddress(o, "PredictionBattle", address(s.battles));
        vm.serializeAddress(o, "CommunityTreasury", address(s.treasury));
        vm.serializeAddress(o, "ClipBoard", address(s.clips));
        vm.serializeAddress(o, "MockMON", address(p.mon));
        vm.serializeAddress(o, "MokoSwap", address(p.swap));
        vm.serializeAddress(o, "MockLST", address(p.lst));
        vm.serializeAddress(o, "LstStrategy", address(p.lstLeg));
        if (address(receiver) != address(0)) vm.serializeAddress(o, "TipReceiver", address(receiver));
        string memory json = vm.serializeAddress(o, "CommunityPoolVault", address(p.pool));
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Deployment written to", path);
    }
}
