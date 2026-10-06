// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {BaseTest} from "./Base.t.sol";
import {Character} from "../src/Character.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {QuestEscrow} from "../src/QuestEscrow.sol";
import {PredictionBattle} from "../src/PredictionBattle.sol";
import {CommunityTreasury} from "../src/CommunityTreasury.sol";
import {ClipBoard} from "../src/ClipBoard.sol";
import {XPKind} from "../src/Types.sol";

/// @notice The indexer credits XP to a guild by matching each XPChanged with the action event that
///         follows it in the same transaction. That only works while every contract grants XP
///         BEFORE it emits its own event, so this pins the order for every action that grants XP.
contract EventOrderTest is BaseTest {
    /// @dev the recorded logs hold `xpEvents` XPChanged before `action`, and none after it
    function _xpThen(bytes32 action, uint256 xpEvents) internal view {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 before;
        uint256 afterwards;
        bool seen;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics.length == 0) continue;
            bytes32 topic = logs[i].topics[0];
            if (topic == action) {
                seen = true;
            } else if (topic == Character.XPChanged.selector) {
                if (seen) afterwards++;
                else before++;
            }
        }
        assertTrue(seen, "the action event was not emitted");
        assertEq(before, xpEvents, "XPChanged before the action event");
        assertEq(afterwards, 0, "XPChanged after the action event");
    }

    function test_tip() public {
        vm.recordLogs();
        vm.prank(alice);
        vault.deposit(creatorId, 5 * USD, "gg");
        _xpThen(SplitVault.Deposited.selector, 1);
    }

    function test_questBackAndClaim() public {
        vm.prank(streamer);
        uint256 q = quests.createQuest(creatorId, "Speedrun", uint64(block.timestamp + 1 hours));
        vm.recordLogs();
        vm.prank(alice);
        quests.back(q, 5 * USD);
        _xpThen(QuestEscrow.QuestBacked.selector, 1);

        vm.prank(streamer);
        quests.proposeOutcome(q, true, "https://twitch.tv/videos/1");
        vm.warp(block.timestamp + cfg.challengeWindow);
        quests.finalize(q);
        vm.recordLogs();
        vm.prank(alice);
        quests.claim(q);
        _xpThen(QuestEscrow.QuestClaimed.selector, 1);
    }

    function test_battleJoinAndClaim() public {
        vm.prank(streamer);
        uint256 b = battles.createBattle(creatorId, "Win?", "Win", "Lose", uint64(block.timestamp + 5 minutes), false);
        vm.recordLogs();
        vm.prank(bob);
        battles.join(b, 0, 5 * USD);
        _xpThen(PredictionBattle.BattleJoined.selector, 1);
        vm.prank(alice);
        battles.join(b, 1, 5 * USD);

        vm.warp(block.timestamp + 5 minutes);
        vm.prank(streamer);
        battles.proposeOutcome(b, true, "https://tracker.gg/match/1");
        vm.warp(block.timestamp + cfg.challengeWindow);
        battles.finalize(b);
        vm.recordLogs();
        vm.prank(bob);
        battles.claim(b);
        _xpThen(PredictionBattle.BattleClaimed.selector, 1);
    }

    function test_treasuryProposeAndVote() public {
        vm.recordLogs();
        vm.prank(alice);
        uint256 p = treasury.propose(creatorId, bob, USD, "Pay Bob for the thumbnails");
        _xpThen(CommunityTreasury.ProposalCreated.selector, 1);

        character.grantXP(bob, 100, XPKind.Tip);
        vm.recordLogs();
        vm.prank(bob);
        treasury.vote(p, true);
        _xpThen(CommunityTreasury.ProposalVoted.selector, 1);
    }

    function test_clipSubmitVoteAndWin() public {
        uint64 submitEnd = uint64(block.timestamp + 1 hours);
        uint64 voteEnd = uint64(block.timestamp + 2 hours);
        vm.startPrank(streamer);
        usd.approve(address(clips), type(uint256).max);
        uint256 id = clips.createBounty(creatorId, "Best clip", 5 * USD, submitEnd, voteEnd);
        vm.stopPrank();

        vm.recordLogs();
        vm.prank(carol);
        uint256 c = clips.submitClip(id, "https://www.tiktok.com/@carol/video/1");
        _xpThen(ClipBoard.ClipSubmitted.selector, 1);

        character.grantXP(bob, 100, XPKind.Tip);
        vm.warp(submitEnd);
        vm.recordLogs();
        vm.prank(bob);
        clips.vote(c);
        _xpThen(ClipBoard.ClipVoted.selector, 2); // the voter's, then the author's

        vm.warp(voteEnd);
        vm.recordLogs();
        clips.finalize(id);
        _xpThen(ClipBoard.BountyWon.selector, 1);
    }
}
