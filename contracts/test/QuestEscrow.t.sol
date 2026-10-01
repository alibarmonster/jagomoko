// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {QuestEscrow} from "../src/QuestEscrow.sol";
import {OptimisticResolver} from "../src/OptimisticResolver.sol";
import {Verdict} from "../src/Types.sol";

contract QuestEscrowTest is BaseTest {
    uint256 questId;

    function setUp() public override {
        super.setUp();
        vm.prank(streamer);
        questId = quests.createQuest(creatorId, "Beat the boss in < 1h", uint64(block.timestamp + 1 hours));
    }

    function _backBoth() internal {
        vm.prank(alice);
        quests.back(questId, 10 * USD);
        vm.prank(bob);
        quests.back(questId, 30 * USD);
    }

    function test_onlyOperatorCreates() public {
        vm.expectRevert(QuestEscrow.NotOperator.selector);
        vm.prank(alice);
        quests.createQuest(creatorId, "x", uint64(block.timestamp + 1 hours));
    }

    function test_backingGrantsKnightBonusXP() public {
        vm.prank(alice);
        quests.back(questId, 10 * USD);
        assertEq(character.xpOf(alice), 150); // 100 * 1.5 knight bonus
        assertEq(quests.getQuest(questId).pool, 10 * USD);
    }

    function test_successRoutesPoolThroughSplitVault() public {
        _backBoth();
        vm.prank(streamer);
        quests.proposeOutcome(questId, true, "https://twitch.tv/vod#t=42m");

        vm.expectRevert(OptimisticResolver.ChallengeWindowOpen.selector);
        quests.finalize(questId);

        vm.warp(block.timestamp + cfg.challengeWindow);
        quests.finalize(questId);

        assertEq(vault.creatorBalance(creatorId), 32 * USD); // 80% of 40
        assertEq(vault.treasuryBalance(creatorId), 6 * USD);
        assertEq(vault.communityBalance(creatorId), 2 * USD);

        uint256 xpBefore = character.xpOf(alice);
        vm.prank(alice);
        uint256 refund = quests.claim(questId);
        assertEq(refund, 0);
        assertGt(character.xpOf(alice), xpBefore); // completion bonus
    }

    function test_failRefunds90Percent_10PercentToTreasury() public {
        _backBoth();
        vm.prank(streamer);
        quests.proposeOutcome(questId, false, "");
        vm.warp(block.timestamp + cfg.challengeWindow);
        quests.finalize(questId);

        assertEq(vault.treasuryBalance(creatorId), 4 * USD);
        assertEq(vault.creatorBalance(creatorId), 0);

        uint256 a0 = usd.balanceOf(alice);
        vm.prank(alice);
        quests.claim(questId);
        assertEq(usd.balanceOf(alice) - a0, 9 * USD);

        uint256 b0 = usd.balanceOf(bob);
        vm.prank(bob);
        quests.claim(questId);
        assertEq(usd.balanceOf(bob) - b0, 27 * USD);

        vm.expectRevert(QuestEscrow.NothingToClaim.selector);
        vm.prank(bob);
        quests.claim(questId);
    }

    function test_backingClosesAfterProposal() public {
        _backBoth();
        vm.prank(streamer);
        quests.proposeOutcome(questId, true, "");
        vm.expectRevert(QuestEscrow.QuestClosed.selector);
        vm.prank(carol);
        quests.back(questId, USD);
    }

    function test_viewerCannotClaimSuccess() public {
        _backBoth();
        vm.expectRevert(QuestEscrow.NotOperator.selector);
        vm.prank(alice);
        quests.proposeOutcome(questId, true, "");
    }

    function test_anyoneCanReportFailureWhenStale() public {
        _backBoth();
        vm.expectRevert(QuestEscrow.NotOperator.selector);
        vm.prank(alice);
        quests.proposeOutcome(questId, false, "");

        vm.warp(block.timestamp + 2 hours + 1);
        vm.prank(alice);
        quests.proposeOutcome(questId, false, "");
    }

    function test_disputeGoesToJury_juryOverturns() public {
        _enlist(judge1);
        _enlist(judge2);
        _enlist(judge3);
        _backBoth();

        vm.prank(streamer);
        quests.proposeOutcome(questId, true, "fake proof");

        vm.expectRevert(OptimisticResolver.NotParticipant.selector);
        vm.prank(carol);
        quests.dispute(questId);

        vm.prank(alice);
        quests.dispute(questId);
        uint256 caseId = quests.resolutionOf(questId).caseId;
        assertEq(jury.getCase(caseId).jurors.length, 3);

        vm.prank(judge1);
        jury.vote(caseId, Verdict.No);
        vm.prank(judge2);
        jury.vote(caseId, Verdict.No);
        vm.prank(judge3);
        jury.vote(caseId, Verdict.Yes);
        jury.resolve(caseId);

        assertEq(uint8(quests.resolutionOf(questId).verdict), uint8(Verdict.No));
        assertEq(vault.treasuryBalance(creatorId), 4 * USD);
        uint256 a0 = usd.balanceOf(alice);
        vm.prank(alice);
        quests.claim(questId);
        assertEq(usd.balanceOf(alice) - a0, 9 * USD);
    }

    function test_disputeWithNoJurorsIsInvalid_fullRefund() public {
        _backBoth();
        vm.prank(streamer);
        quests.proposeOutcome(questId, true, "");
        vm.prank(bob);
        quests.dispute(questId);
        jury.resolve(quests.resolutionOf(questId).caseId);

        uint256 b0 = usd.balanceOf(bob);
        vm.prank(bob);
        quests.claim(questId);
        assertEq(usd.balanceOf(bob) - b0, 30 * USD);
    }

    function testFuzz_failClaimsNeverExceedPool(uint64 a, uint64 b, uint64 c) public {
        a = uint64(bound(a, 1, 500 * USD));
        b = uint64(bound(b, 1, 500 * USD));
        c = uint64(bound(c, 1, 500 * USD));
        vm.prank(alice);
        quests.back(questId, a);
        vm.prank(bob);
        quests.back(questId, b);
        vm.prank(carol);
        quests.back(questId, c);

        vm.prank(streamer);
        quests.proposeOutcome(questId, false, "");
        vm.warp(block.timestamp + cfg.challengeWindow);
        quests.finalize(questId);

        vm.prank(alice);
        uint256 ra = quests.claim(questId);
        vm.prank(bob);
        uint256 rb = quests.claim(questId);
        vm.prank(carol);
        uint256 rc = quests.claim(questId);

        uint256 pool = uint256(a) + b + c;
        assertLe(ra + rb + rc + vault.treasuryBalance(creatorId), pool);
        assertLe(usd.balanceOf(address(quests)), 3); // at most rounding dust left
    }
}
