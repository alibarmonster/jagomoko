// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {Character} from "../src/Character.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {Jury} from "../src/Jury.sol";
import {QuestEscrow} from "../src/QuestEscrow.sol";
import {PredictionBattle} from "../src/PredictionBattle.sol";
import {CommunityTreasury} from "../src/CommunityTreasury.sol";
import {Verdict, XPKind} from "../src/Types.sol";

/// @notice Seeds a LOCAL anvil deployment (Deploy.s.sol with DEMO_MODE=true)
///         with a realistic demo story. Uses anvil's public test mnemonic —
///         never point this at a real network. Run the phases in order,
///         advancing anvil time in between (see scripts in the repo):
///           forge script script/Seed.s.sol --sig "setup()"  --rpc-url local --broadcast
///           cast rpc evm_increaseTime 180 && cast rpc evm_mine
///           forge script script/Seed.s.sol --sig "resolve()" --rpc-url local --broadcast
///           cast rpc evm_increaseTime 90000 && cast rpc evm_mine
///           forge script script/Seed.s.sol --sig "settle()" --rpc-url local --broadcast
contract Seed is Script {
    string constant ANVIL_MNEMONIC = "test test test test test test test test test test test junk";
    uint256 constant USD = 1e6;

    MockUSD usd;
    CreatorRegistry registry;
    Character character;
    SplitVault vault;
    Jury jury;
    QuestEscrow quests;
    PredictionBattle battles;
    CommunityTreasury treasury;

    uint256 deployer;
    uint256 streamer;
    uint256 alice;
    uint256 bob;
    uint256 carol;
    uint256 dave;
    uint256 erin;

    function _load() internal {
        require(block.chainid == 31337, "Seed: local anvil only");
        string memory json = vm.readFile("deployments/31337.json");
        usd = MockUSD(vm.parseJsonAddress(json, ".MockUSD"));
        registry = CreatorRegistry(vm.parseJsonAddress(json, ".CreatorRegistry"));
        character = Character(vm.parseJsonAddress(json, ".Character"));
        vault = SplitVault(vm.parseJsonAddress(json, ".SplitVault"));
        jury = Jury(vm.parseJsonAddress(json, ".Jury"));
        quests = QuestEscrow(vm.parseJsonAddress(json, ".QuestEscrow"));
        battles = PredictionBattle(vm.parseJsonAddress(json, ".PredictionBattle"));
        treasury = CommunityTreasury(vm.parseJsonAddress(json, ".CommunityTreasury"));

        deployer = vm.deriveKey(ANVIL_MNEMONIC, 0);
        streamer = vm.deriveKey(ANVIL_MNEMONIC, 1);
        alice = vm.deriveKey(ANVIL_MNEMONIC, 2);
        bob = vm.deriveKey(ANVIL_MNEMONIC, 3);
        carol = vm.deriveKey(ANVIL_MNEMONIC, 4);
        dave = vm.deriveKey(ANVIL_MNEMONIC, 5);
        erin = vm.deriveKey(ANVIL_MNEMONIC, 6);
    }

    /// Phase 1: creator, characters, tips, quests, a battle, a disputed quest
    /// resolved by the jury, and a treasury proposal.
    function setup() external {
        _load();
        uint256 creatorId;

        vm.startBroadcast(deployer);
        uint256[6] memory players = [alice, bob, carol, dave, erin, streamer];
        for (uint256 i; i < players.length; ++i) {
            usd.mint(vm.addr(players[i]), 200 * USD);
        }
        vm.stopBroadcast();

        vm.startBroadcast(streamer);
        creatorId = registry.register("NeonBlade", CreatorRegistry.Split({creatorBps: 8_000, treasuryBps: 1_500, communityBps: 500}));
        vm.stopBroadcast();

        _mint(alice, Character.Role.Knight, "Alice");
        _mint(bob, Character.Role.Seer, "Bob");
        _mint(carol, Character.Role.Judge, "Carol");
        _mint(dave, Character.Role.Judge, "Dave");
        _mint(erin, Character.Role.Judge, "Erin");

        // judges are leveled for the demo (DEMO_MODE lets the deployer grant XP)
        vm.startBroadcast(deployer);
        character.grantXP(vm.addr(carol), 2_000, XPKind.Governance);
        character.grantXP(vm.addr(dave), 2_000, XPKind.Governance);
        character.grantXP(vm.addr(erin), 2_000, XPKind.Governance);
        vm.stopBroadcast();
        _as(carol);
        jury.enlist();
        vm.stopBroadcast();
        _as(dave);
        jury.enlist();
        vm.stopBroadcast();
        _as(erin);
        jury.enlist();
        vm.stopBroadcast();

        _as(alice);
        vault.deposit(creatorId, 10 * USD, "Let's gooo! Beat that boss");
        vm.stopBroadcast();
        _as(bob);
        vault.deposit(creatorId, 5 * USD, "gg");
        vm.stopBroadcast();

        _as(streamer);
        uint256 q1 = quests.createQuest(creatorId, "Beat the Ender Dragon in under 1 hour", uint64(block.timestamp + 1 hours));
        uint256 q2 = quests.createQuest(creatorId, "No-death run of the Water Temple", uint64(block.timestamp + 1 hours));
        battles.createBattle(creatorId, "Does NeonBlade win this Valorant match?", "Win", "Lose", uint64(block.timestamp + 60), false);
        battles.createBattle(creatorId, "First blood this round?", "Yes", "No", uint64(block.timestamp + 60), true);
        vm.stopBroadcast();

        _as(alice);
        quests.back(q1, 10 * USD);
        quests.back(q2, 5 * USD);
        battles.join(1, 0, 10 * USD);
        battles.join(2, 0, 0);
        vm.stopBroadcast();
        _as(bob);
        quests.back(q1, 20 * USD);
        quests.back(q2, 5 * USD);
        battles.join(1, 1, 30 * USD);
        battles.join(2, 1, 0);
        vm.stopBroadcast();

        _as(streamer);
        quests.proposeOutcome(q1, true, "https://www.twitch.tv/videos/123456789?t=0h42m10s");
        // a dishonest claim with a malicious "proof" link — the indexer must drop the link
        quests.proposeOutcome(q2, true, "javascript:alert(document.cookie)");
        vm.stopBroadcast();

        _as(bob);
        quests.dispute(q2);
        vm.stopBroadcast();
        uint256 caseId = quests.resolutionOf(q2).caseId;
        _as(carol);
        jury.vote(caseId, Verdict.No);
        vm.stopBroadcast();
        _as(dave);
        jury.vote(caseId, Verdict.No);
        vm.stopBroadcast();
        _as(erin);
        jury.vote(caseId, Verdict.Yes);
        vm.stopBroadcast();
        _as(alice);
        jury.resolve(caseId); // all voted -> No: 90% refund, 10% treasury
        vm.stopBroadcast();

        _as(alice);
        treasury.propose(creatorId, vm.addr(carol), 1 * USD, "Clip bounty: best clutch of the week goes to Carol");
        vm.stopBroadcast();
        _as(bob);
        treasury.vote(1, true);
        vm.stopBroadcast();
        _as(carol);
        treasury.vote(1, true);
        vm.stopBroadcast();
    }

    /// Phase 2 (after the challenge window): finalize quest 1, report battles, claim refunds.
    function resolve() external {
        _load();
        _as(alice);
        quests.finalize(1); // success -> pool through the split vault
        quests.claim(1);
        quests.claim(2);
        vm.stopBroadcast();
        _as(bob);
        quests.claim(2);
        vm.stopBroadcast();
        _as(streamer);
        battles.proposeOutcome(1, true, "https://tracker.gg/valorant/match/demo");
        battles.proposeOutcome(2, false, "");
        vm.stopBroadcast();
    }

    /// Phase 3 (after the voting period): settle battles, pay out, execute the proposal.
    function settle() external {
        _load();
        _as(alice);
        battles.finalize(1);
        battles.finalize(2);
        battles.claim(1);
        treasury.execute(1);
        vm.stopBroadcast();
        _as(bob);
        battles.claim(2);
        vm.stopBroadcast();
        _as(streamer);
        vault.withdrawCreator(1, vm.addr(streamer));
        vm.stopBroadcast();
    }

    function _mint(uint256 pk, Character.Role role, string memory name) internal {
        _as(pk);
        character.mint(role, name);
        IERC20(address(usd)).approve(address(vault), type(uint256).max);
        IERC20(address(usd)).approve(address(quests), type(uint256).max);
        IERC20(address(usd)).approve(address(battles), type(uint256).max);
        vm.stopBroadcast();
    }

    function _as(uint256 pk) internal {
        vm.startBroadcast(pk);
    }
}
