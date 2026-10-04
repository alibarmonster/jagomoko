// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StreamQuestDeployer} from "./StreamQuestDeployer.sol";

/// @notice forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
///         Env: PRIVATE_KEY (deployer), DEMO_MODE=true to let the deployer
///         grant XP for seeding a demo (never enable on a real deployment).
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
        string memory json = vm.serializeAddress(o, "CommunityTreasury", address(s.treasury));
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Deployment written to", path);
    }
}
