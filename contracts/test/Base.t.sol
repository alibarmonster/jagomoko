// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StreamQuestDeployer} from "../script/StreamQuestDeployer.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {Character} from "../src/Character.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {Jury} from "../src/Jury.sol";
import {QuestEscrow} from "../src/QuestEscrow.sol";
import {PredictionBattle} from "../src/PredictionBattle.sol";
import {CommunityTreasury} from "../src/CommunityTreasury.sol";
import {ClipBoard} from "../src/ClipBoard.sol";
import {XPKind} from "../src/Types.sol";

abstract contract BaseTest is Test, StreamQuestDeployer {
    MockUSD usd;
    CreatorRegistry registry;
    Character character;
    SplitVault vault;
    Jury jury;
    QuestEscrow quests;
    PredictionBattle battles;
    CommunityTreasury treasury;
    ClipBoard clips;
    Config cfg;

    address streamer = makeAddr("streamer");
    address mod = makeAddr("mod");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address judge1 = makeAddr("judge1");
    address judge2 = makeAddr("judge2");
    address judge3 = makeAddr("judge3");

    uint256 creatorId;

    uint256 constant USD = 1e6;

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        cfg = defaultConfig();
        System memory s = _deploy(address(this), cfg);
        usd = s.usd;
        registry = s.registry;
        character = s.character;
        vault = s.vault;
        jury = s.jury;
        quests = s.quests;
        battles = s.battles;
        treasury = s.treasury;
        clips = s.clips;

        // test contract may grant XP directly (for leveling judges)
        character.grantRole(character.XP_GRANTER(), address(this));

        vm.prank(streamer);
        creatorId = registry.register("streamer", CreatorRegistry.Split({creatorBps: 8_000, treasuryBps: 1_500, communityBps: 500}));
        vm.prank(streamer);
        registry.setModerator(creatorId, mod, true);

        _player(alice, Character.Role.Knight, "Alice");
        _player(bob, Character.Role.Seer, "Bob");
        _player(carol, Character.Role.Bard, "Carol");
        _player(judge1, Character.Role.Judge, "J1");
        _player(judge2, Character.Role.Judge, "J2");
        _player(judge3, Character.Role.Judge, "J3");
        usd.mint(streamer, 1_000 * USD);
        usd.mint(mod, 1_000 * USD);
    }

    function _player(address who, Character.Role role, string memory name) internal {
        vm.prank(who);
        character.mint(role, name);
        usd.mint(who, 1_000 * USD);
        vm.startPrank(who);
        usd.approve(address(vault), type(uint256).max);
        usd.approve(address(quests), type(uint256).max);
        usd.approve(address(battles), type(uint256).max);
        vm.stopPrank();
    }

    /// @dev levels a judge to jury eligibility and enlists them
    function _enlist(address who) internal {
        character.grantXP(who, 2_000, XPKind.Governance); // level 5
        vm.prank(who);
        jury.enlist();
    }
}
