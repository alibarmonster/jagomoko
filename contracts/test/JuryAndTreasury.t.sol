// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {Jury} from "../src/Jury.sol";
import {Character} from "../src/Character.sol";
import {CommunityTreasury} from "../src/CommunityTreasury.sol";
import {Verdict, XPKind} from "../src/Types.sol";

contract JuryTest is BaseTest {
    uint256 questId;

    function setUp() public override {
        super.setUp();
        vm.prank(streamer);
        questId = quests.createQuest(creatorId, "Speedrun", uint64(block.timestamp + 1 hours));
        // fund community pool for juror fees
        vm.prank(carol);
        vault.deposit(creatorId, 100 * USD, "");
    }

    function test_onlyLeveledJudgesEnlist() public {
        vm.expectRevert(Jury.NotEligible.selector);
        vm.prank(judge1); // level 1
        jury.enlist();

        character.grantXP(alice, 5_000, XPKind.Tip); // high level, but a Knight
        vm.expectRevert(Jury.NotEligible.selector);
        vm.prank(alice);
        jury.enlist();
    }

    function test_participantsExcludedFromJury() public {
        _enlist(judge1);
        _enlist(judge2);
        vm.prank(judge1);
        quests.back(questId, USD); // judge1 now has a stake
        vm.prank(alice);
        quests.back(questId, USD);

        vm.prank(streamer);
        quests.proposeOutcome(questId, true, "");
        vm.prank(alice);
        quests.dispute(questId);

        address[] memory jurors = jury.getCase(quests.resolutionOf(questId).caseId).jurors;
        assertEq(jurors.length, 1);
        assertEq(jurors[0], judge2);
    }

    function test_rewardsHonestSlashesDishonestAndAbsent() public {
        _enlist(judge1);
        _enlist(judge2);
        _enlist(judge3);
        vm.prank(alice);
        quests.back(questId, 10 * USD);
        vm.prank(streamer);
        quests.proposeOutcome(questId, true, "");
        vm.prank(alice);
        quests.dispute(questId);
        uint256 caseId = quests.resolutionOf(questId).caseId;

        uint256 x1 = character.xpOf(judge1);
        uint256 x2 = character.xpOf(judge2);
        uint256 x3 = character.xpOf(judge3);
        uint256 bal1 = usd.balanceOf(judge1);

        vm.prank(judge1);
        jury.vote(caseId, Verdict.Yes);
        vm.prank(judge2);
        jury.vote(caseId, Verdict.No);
        // judge3 absent -> resolve only after window
        vm.expectRevert(Jury.TooEarly.selector);
        jury.resolve(caseId);
        vm.warp(block.timestamp + cfg.juryVoteWindow);

        vm.expectRevert(Jury.VotingClosed.selector);
        vm.prank(judge3);
        jury.vote(caseId, Verdict.Yes);

        jury.resolve(caseId); // 1-1 tie -> Invalid
        assertEq(uint8(quests.resolutionOf(questId).verdict), uint8(Verdict.Invalid));
        assertEq(character.xpOf(judge1), x1); // tie: voters unaffected
        assertEq(character.xpOf(judge2), x2);
        assertEq(character.xpOf(judge3), x3 - jury.ABSENT_SLASH());
        assertEq(usd.balanceOf(judge1), bal1);
    }

    function test_majorityEarnsFeeAndBonusXP() public {
        _enlist(judge1);
        _enlist(judge2);
        _enlist(judge3);
        vm.prank(alice);
        quests.back(questId, 10 * USD);
        vm.prank(streamer);
        quests.proposeOutcome(questId, true, "");
        vm.prank(alice);
        quests.dispute(questId);
        uint256 caseId = quests.resolutionOf(questId).caseId;

        uint256 x1 = character.xpOf(judge1);
        uint256 x3 = character.xpOf(judge3);
        vm.prank(judge1);
        jury.vote(caseId, Verdict.Yes);
        vm.prank(judge2);
        jury.vote(caseId, Verdict.Yes);
        vm.prank(judge3);
        jury.vote(caseId, Verdict.No);
        jury.resolve(caseId); // all voted -> immediate

        assertEq(character.xpOf(judge1) - x1, 150); // 100 * 1.5 judge bonus
        assertEq(x3 - character.xpOf(judge3), jury.DISHONEST_SLASH());
        assertEq(usd.balanceOf(judge1), 1_000 * USD + cfg.jurorFee);
        assertEq(uint8(quests.resolutionOf(questId).verdict), uint8(Verdict.Yes));
    }

    function test_onlyClientsOpenCases() public {
        vm.expectRevert();
        vm.prank(alice);
        jury.openCase(1, creatorId);
    }

    function test_onlyJuryCallsBack() public {
        vm.expectRevert();
        vm.prank(alice);
        quests.onJuryVerdict(questId, Verdict.Yes);
    }
}

contract TreasuryTest is BaseTest {
    function setUp() public override {
        super.setUp();
        vm.prank(alice);
        vault.deposit(creatorId, 100 * USD, ""); // treasury = 15
        character.grantXP(bob, 400, XPKind.Tip); // weight 20
    }

    function test_proposalPassesAndPays() public {
        vm.prank(carol);
        uint256 id = treasury.propose(creatorId, carol, 5 * USD, "Clip bounty: best clutch");
        vm.prank(bob);
        treasury.vote(id, true);
        vm.expectRevert(CommunityTreasury.VotingActive.selector);
        treasury.execute(id);

        vm.warp(block.timestamp + cfg.votingPeriod);
        uint256 c0 = usd.balanceOf(carol);
        treasury.execute(id);
        assertEq(usd.balanceOf(carol) - c0, 5 * USD);
        assertEq(vault.treasuryBalance(creatorId), 10 * USD);
        assertEq(uint8(treasury.getProposal(id).status), uint8(CommunityTreasury.Status.Executed));
    }

    function test_defeatedWithoutQuorum() public {
        vm.prank(carol);
        uint256 id = treasury.propose(creatorId, carol, 5 * USD, "x");
        vm.warp(block.timestamp + cfg.votingPeriod);
        treasury.execute(id);
        assertEq(uint8(treasury.getProposal(id).status), uint8(CommunityTreasury.Status.Defeated));
    }

    function test_sqrtWeightAndSingleVote() public {
        vm.prank(carol);
        uint256 id = treasury.propose(creatorId, carol, 5 * USD, "x");
        vm.startPrank(bob);
        treasury.vote(id, false);
        vm.expectRevert(CommunityTreasury.AlreadyVoted.selector);
        treasury.vote(id, true);
        vm.stopPrank();
        assertEq(treasury.getProposal(id).againstWeight, 20);
    }

    function test_creatorVeto() public {
        vm.prank(carol);
        uint256 id = treasury.propose(creatorId, carol, 5 * USD, "x");
        vm.expectRevert(CommunityTreasury.NotCreator.selector);
        vm.prank(alice);
        treasury.veto(id);
        vm.prank(streamer);
        treasury.veto(id);
        assertEq(uint8(treasury.getProposal(id).status), uint8(CommunityTreasury.Status.Vetoed));
    }

    function test_needsCharacterToPropose() public {
        vm.expectRevert(CommunityTreasury.NoCharacter.selector);
        vm.prank(streamer);
        treasury.propose(creatorId, streamer, 1, "x");
    }
}
