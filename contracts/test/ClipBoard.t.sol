// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {Character} from "../src/Character.sol";
import {ClipBoard} from "../src/ClipBoard.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {XPKind} from "../src/Types.sol";

contract ClipBoardTest is BaseTest {
    address dave = makeAddr("dave");
    address erin = makeAddr("erin");

    uint64 submitEnd;
    uint64 voteEnd;

    string constant URL = "https://www.tiktok.com/@carol/video/7300000000000000001";

    function setUp() public override {
        super.setUp();
        _player(dave, Character.Role.Bard, "Dave");
        _player(erin, Character.Role.Bard, "Erin");
        // voting weight is sqrt(XP): 100 XP -> 10, 400 XP -> 20
        character.grantXP(alice, 100, XPKind.Tip);
        character.grantXP(bob, 400, XPKind.Tip);
        character.grantXP(judge1, 100, XPKind.Tip);
        vm.prank(streamer);
        usd.approve(address(clips), type(uint256).max);
        vm.prank(mod);
        usd.approve(address(clips), type(uint256).max);
    }

    // ---- helpers ----

    /// @dev submissions for an hour, then voting for an hour, from now
    function _bounty(uint256 reward) internal returns (uint256 id) {
        submitEnd = uint64(block.timestamp + 1 hours);
        voteEnd = uint64(block.timestamp + 2 hours);
        vm.prank(streamer);
        id = clips.createBounty(creatorId, "Best clip of the boss fight", reward, submitEnd, voteEnd);
    }

    function _submit(address bard, uint256 bountyId) internal returns (uint256) {
        vm.prank(bard);
        return clips.submitClip(bountyId, URL);
    }

    function _vote(address voter, uint256 clipId) internal {
        vm.prank(voter);
        clips.vote(clipId);
    }

    /// @dev a character with `xp` XP (a Knight, so no specialty bonus on Tip XP)
    function _voter(uint256 i, uint256 xp) internal returns (address who) {
        who = address(uint160(0xB0000 + i));
        vm.prank(who);
        character.mint(Character.Role.Knight, "Voter");
        if (xp > 0) character.grantXP(who, xp, XPKind.Tip);
    }

    /// @dev the community treasury pays `amount` to the clip board through a passed Spend proposal
    function _payout(uint256 forCreator, uint256 amount) internal returns (uint256 proposalId) {
        vm.prank(alice);
        vault.fundTreasury(forCreator, 100 * USD, "seed");
        vm.prank(alice);
        proposalId = treasury.propose(forCreator, address(clips), amount, "Clip bounty pool");
        vm.prank(alice);
        treasury.vote(proposalId, true); // weight 10 = the quorum
        vm.warp(block.timestamp + cfg.votingPeriod);
        treasury.execute(proposalId);
    }

    // ---- creating ----

    function test_createBountyEscrowsTheReward() public {
        uint256 before = usd.balanceOf(streamer);
        uint256 id = _bounty(25 * USD);
        assertEq(usd.balanceOf(address(clips)), 25 * USD);
        assertEq(usd.balanceOf(streamer), before - 25 * USD);
        ClipBoard.Bounty memory b = clips.getBounty(id);
        assertEq(b.creatorId, creatorId);
        assertEq(b.funder, streamer);
        assertEq(b.escrow, 25 * USD);
        assertEq(b.communityFunds, 0);
        assertEq(b.submitEnd, submitEnd);
        assertEq(b.voteEnd, voteEnd);
        assertEq(b.title, "Best clip of the boss fight");
        assertFalse(b.finalized);
    }

    function test_zeroRewardBountyWaitsForTheCommunity() public {
        uint256 id = _bounty(0);
        assertEq(clips.getBounty(id).funder, address(0));
        assertEq(usd.balanceOf(address(clips)), 0);
    }

    function test_onlyTheCreatorAndModsCreate() public {
        uint64 s = uint64(block.timestamp + 1 hours);
        uint64 e = uint64(block.timestamp + 2 hours);
        vm.expectRevert(ClipBoard.NotOperator.selector);
        vm.prank(alice);
        clips.createBounty(creatorId, "Mine", 0, s, e);

        vm.expectRevert(CreatorRegistry.UnknownCreator.selector);
        vm.prank(streamer);
        clips.createBounty(999, "Nobody", 0, s, e);

        vm.prank(mod);
        uint256 id = clips.createBounty(creatorId, "From the mod", 5 * USD, s, e);
        assertEq(clips.getBounty(id).funder, mod);
    }

    function test_rejectsBadTitlesAndWindows() public {
        uint256 t = block.timestamp;
        vm.startPrank(streamer);
        vm.expectRevert(ClipBoard.InvalidTitle.selector);
        clips.createBounty(creatorId, "", 0, uint64(t + 1 hours), uint64(t + 2 hours));
        vm.expectRevert(ClipBoard.InvalidTitle.selector);
        clips.createBounty(creatorId, string(new bytes(81)), 0, uint64(t + 1 hours), uint64(t + 2 hours));
        vm.expectRevert(ClipBoard.BadWindow.selector);
        clips.createBounty(creatorId, "Too soon", 0, uint64(t + 59), uint64(t + 2 hours));
        vm.expectRevert(ClipBoard.BadWindow.selector);
        clips.createBounty(creatorId, "No time to vote", 0, uint64(t + 1 hours), uint64(t + 1 hours + 59));
        vm.expectRevert(ClipBoard.BadWindow.selector);
        clips.createBounty(creatorId, "Too long", 0, uint64(t + 1 hours), uint64(t + 31 days));
        // the shortest allowed: a minute to submit, a minute to vote
        clips.createBounty(creatorId, "Speed round", 0, uint64(t + 1 minutes), uint64(t + 2 minutes));
        vm.stopPrank();
    }

    // ---- submitting ----

    function test_onlyBardsSubmit() public {
        uint256 id = _bounty(0);
        vm.expectRevert(ClipBoard.NotBard.selector);
        vm.prank(alice); // a Knight
        clips.submitClip(id, URL);

        vm.expectRevert(ClipBoard.NoCharacter.selector);
        vm.prank(makeAddr("stranger"));
        clips.submitClip(id, URL);

        uint256 xp = character.xpOf(carol);
        uint256 clipId = _submit(carol, id);
        assertEq(clipId, 1);
        assertEq(character.xpOf(carol), xp + 30); // 20, with the Bard's specialty bonus
        assertTrue(clips.hasSubmitted(id, carol));
        assertEq(clips.getClip(clipId).author, carol);
        assertEq(clips.clipsOf(id).length, 1);
    }

    function test_creatorAndModsCannotSubmit() public {
        uint256 id = _bounty(0);
        vm.prank(mod);
        character.mint(Character.Role.Bard, "Mod");
        vm.expectRevert(ClipBoard.NotAllowed.selector);
        vm.prank(mod);
        clips.submitClip(id, URL);
    }

    function test_oneClipPerBard() public {
        uint256 id = _bounty(0);
        _submit(carol, id);
        vm.expectRevert(ClipBoard.AlreadySubmitted.selector);
        vm.prank(carol);
        clips.submitClip(id, "https://youtu.be/another");
        // a different bounty is fine
        _submit(carol, _bounty(0));
    }

    function test_atMostFiftyClips() public {
        uint256 id = _bounty(0);
        for (uint256 i; i < 50; ++i) {
            address bard = address(uint160(0xA0000 + i));
            vm.startPrank(bard);
            character.mint(Character.Role.Bard, "Bard");
            clips.submitClip(id, URL);
            vm.stopPrank();
        }
        vm.expectRevert(ClipBoard.TooManyClips.selector);
        vm.prank(carol);
        clips.submitClip(id, URL);
    }

    function test_linksMustBeHttps() public {
        uint256 id = _bounty(0);
        vm.startPrank(carol);
        vm.expectRevert(ClipBoard.InvalidUrl.selector);
        clips.submitClip(id, "");
        vm.expectRevert(ClipBoard.InvalidUrl.selector);
        clips.submitClip(id, "https://");
        vm.expectRevert(ClipBoard.InvalidUrl.selector);
        clips.submitClip(id, "http://www.tiktok.com/@carol/video/1");
        vm.expectRevert(ClipBoard.InvalidUrl.selector);
        clips.submitClip(id, "javascript:alert(1)");
        vm.expectRevert(ClipBoard.InvalidUrl.selector);
        clips.submitClip(id, string.concat("https://", string(_filled(249)))); // 257 bytes
        clips.submitClip(id, string.concat("https://", string(_filled(248)))); // 256 bytes is the limit
        vm.stopPrank();
    }

    function test_submissionsCloseOnTime() public {
        uint256 id = _bounty(0);
        vm.warp(submitEnd);
        vm.expectRevert(ClipBoard.SubmissionsClosed.selector);
        vm.prank(carol);
        clips.submitClip(id, URL);

        vm.expectRevert(ClipBoard.UnknownBounty.selector);
        vm.prank(carol);
        clips.submitClip(42, URL);
    }

    // ---- voting ----

    function test_votingRules() public {
        uint256 id = _bounty(0);
        uint256 c1 = _submit(carol, id);
        uint256 c2 = _submit(dave, id);

        vm.expectRevert(ClipBoard.VotingClosed.selector); // still taking clips
        vm.prank(alice);
        clips.vote(c1);

        vm.warp(submitEnd);
        vm.expectRevert(ClipBoard.OwnClip.selector);
        vm.prank(carol);
        clips.vote(c1);

        address noXp = _voter(1, 0);
        vm.expectRevert(ClipBoard.NoWeight.selector);
        vm.prank(noXp);
        clips.vote(c1);

        vm.expectRevert(ClipBoard.UnknownClip.selector);
        vm.prank(alice);
        clips.vote(99);

        _vote(alice, c1);
        vm.expectRevert(ClipBoard.AlreadyVoted.selector); // one vote per bounty, not per clip
        vm.prank(alice);
        clips.vote(c2);
        assertEq(clips.votedClip(id, alice), c1);

        // a Bard who entered may still vote for someone else's clip
        _vote(carol, c2);

        vm.warp(voteEnd);
        vm.expectRevert(ClipBoard.VotingClosed.selector);
        vm.prank(bob);
        clips.vote(c1);
    }

    function test_creatorAndModsCannotVote() public {
        uint256 id = _bounty(0);
        uint256 c1 = _submit(carol, id);
        vm.prank(mod);
        character.mint(Character.Role.Knight, "Mod");
        character.grantXP(mod, 100, XPKind.Tip);
        vm.warp(submitEnd);
        vm.expectRevert(ClipBoard.NotAllowed.selector);
        vm.prank(mod);
        clips.vote(c1);
    }

    function test_weightIsSqrtXpAndBothSidesEarnXp() public {
        uint256 id = _bounty(0);
        uint256 c1 = _submit(carol, id);
        vm.warp(submitEnd);
        uint256 voterXp = character.xpOf(bob);
        uint256 authorXp = character.xpOf(carol);
        _vote(bob, c1);
        ClipBoard.Clip memory c = clips.getClip(c1);
        assertEq(c.weight, 20); // sqrt(400)
        assertEq(c.votes, 1);
        assertEq(character.xpOf(bob), voterXp + 5); // Governance, no bonus for a Seer
        assertEq(character.xpOf(carol), authorXp + 7); // 5 Clip XP with the Bard bonus
    }

    function test_authorXpStopsAfterTwentyVotes() public {
        uint256 id = _bounty(0);
        uint256 c1 = _submit(carol, id);
        vm.warp(submitEnd);
        uint256 xp = character.xpOf(carol);
        for (uint256 i; i < 21; ++i) _vote(_voter(i, 100), c1);
        assertEq(clips.getClip(c1).votes, 21);
        assertEq(character.xpOf(carol), xp + 20 * 7);
    }

    // ---- hiding ----

    function test_hiddenClipsTakeNoVotesAndCannotWin() public {
        uint256 id = _bounty(10 * USD);
        uint256 c1 = _submit(carol, id);
        uint256 c2 = _submit(dave, id);
        vm.warp(submitEnd);
        _vote(alice, c1); // 10
        _vote(bob, c2); // 20

        vm.expectRevert(ClipBoard.NotOperator.selector);
        vm.prank(alice);
        clips.hide(c2, true);

        vm.prank(mod);
        clips.hide(c2, true);
        assertTrue(clips.getClip(c2).hidden);
        vm.expectRevert(ClipBoard.ClipIsHidden.selector);
        vm.prank(judge1);
        clips.vote(c2);

        vm.warp(voteEnd);
        vm.expectRevert(ClipBoard.BountyClosed.selector); // the result is fixed once voting ends
        vm.prank(streamer);
        clips.hide(c2, false);

        clips.finalize(id);
        assertEq(clips.getBounty(id).winningClip, c1);
        assertEq(usd.balanceOf(address(clips)), 0);
    }

    function test_unhideRestoresAClip() public {
        uint256 id = _bounty(0);
        uint256 c1 = _submit(carol, id);
        vm.startPrank(streamer);
        clips.hide(c1, true);
        clips.hide(c1, false);
        vm.stopPrank();
        vm.warp(submitEnd);
        _vote(alice, c1);
        assertEq(clips.getClip(c1).weight, 10);
    }

    // ---- finalizing ----

    function test_mostWeightWinsTheWholeReward() public {
        uint256 id = _bounty(25 * USD);
        uint256 c1 = _submit(carol, id);
        uint256 c2 = _submit(dave, id);
        vm.warp(submitEnd);
        _vote(alice, c1); // 10
        _vote(bob, c2); // 20
        vm.warp(voteEnd);

        uint256 before = usd.balanceOf(dave);
        uint256 xp = character.xpOf(dave);
        clips.finalize(id);
        assertEq(usd.balanceOf(dave), before + 25 * USD);
        assertEq(character.xpOf(dave), xp + 450); // 300 with the Bard bonus
        assertEq(clips.getBounty(id).winningClip, c2);
        assertTrue(clips.getBounty(id).finalized);
        assertEq(usd.balanceOf(address(clips)), 0);
    }

    function test_tieGoesToTheFirstClip() public {
        uint256 id = _bounty(10 * USD);
        uint256 c1 = _submit(carol, id);
        uint256 c2 = _submit(dave, id);
        vm.warp(submitEnd);
        _vote(alice, c1); // 10
        _vote(judge1, c1); // 10 -> 20
        _vote(bob, c2); // 20
        vm.warp(voteEnd);
        clips.finalize(id);
        assertEq(clips.getBounty(id).winningClip, c1);
    }

    function test_noVotesGivesTheEscrowBack() public {
        uint256 before = usd.balanceOf(streamer);
        uint256 id = _bounty(25 * USD);
        _submit(carol, id);
        vm.warp(voteEnd);
        clips.finalize(id);
        assertEq(usd.balanceOf(streamer), before);
        assertEq(clips.getBounty(id).winningClip, 0);
        assertEq(usd.balanceOf(address(clips)), 0);
    }

    function test_finalizeRules() public {
        uint256 id = _bounty(USD);
        vm.expectRevert(ClipBoard.VotingActive.selector);
        clips.finalize(id);
        vm.warp(voteEnd);
        clips.finalize(id);
        vm.expectRevert(ClipBoard.BountyClosed.selector);
        clips.finalize(id);
        vm.expectRevert(ClipBoard.UnknownBounty.selector);
        clips.finalize(7);
    }

    function test_winXpNeedsAtLeastADollar() public {
        uint256 small = _bounty(USD / 2);
        uint256 c1 = _submit(carol, small);
        vm.warp(submitEnd);
        _vote(alice, c1);
        vm.warp(voteEnd);
        uint256 xp = character.xpOf(carol);
        clips.finalize(small);
        assertEq(character.xpOf(carol), xp); // paid, but no win XP for pocket change

        uint256 dollar = _bounty(USD);
        uint256 c2 = _submit(carol, dollar);
        vm.warp(submitEnd);
        _vote(alice, c2);
        vm.warp(voteEnd);
        xp = character.xpOf(carol);
        clips.finalize(dollar);
        assertEq(character.xpOf(carol), xp + 450);
    }

    // ---- community money ----

    function test_communityFundedBountyPaysTheWinner() public {
        uint256 pid = _payout(creatorId, 20 * USD);
        assertEq(usd.balanceOf(address(clips)), 20 * USD);
        uint256 id = _bounty(0);

        vm.expectRevert(ClipBoard.NotAllowed.selector); // only an operator or the proposer
        vm.prank(bob);
        clips.fundFromProposal(id, pid);

        vm.prank(alice); // she proposed it
        clips.fundFromProposal(id, pid);
        assertEq(clips.getBounty(id).communityFunds, 20 * USD);
        assertTrue(clips.proposalUsed(pid));

        uint256 another = _bounty(0);
        vm.expectRevert(ClipBoard.ProposalUsed.selector);
        vm.prank(streamer);
        clips.fundFromProposal(another, pid);

        uint256 c1 = _submit(carol, id);
        vm.warp(submitEnd);
        _vote(bob, c1);
        vm.warp(voteEnd);
        uint256 before = usd.balanceOf(carol);
        clips.finalize(id);
        assertEq(usd.balanceOf(carol), before + 20 * USD);
    }

    function test_bothSourcesAddUp() public {
        uint256 pid = _payout(creatorId, 20 * USD);
        uint256 id = _bounty(10 * USD);
        vm.prank(streamer);
        clips.fundFromProposal(id, pid);
        uint256 c1 = _submit(carol, id);
        vm.warp(submitEnd);
        _vote(bob, c1);
        vm.warp(voteEnd);
        uint256 before = usd.balanceOf(carol);
        clips.finalize(id);
        assertEq(usd.balanceOf(carol), before + 30 * USD);
        assertEq(usd.balanceOf(address(clips)), 0);
    }

    function test_withoutAWinnerEachPartGoesHome() public {
        uint256 pid = _payout(creatorId, 20 * USD);
        uint256 id = _bounty(10 * USD);
        vm.prank(streamer);
        clips.fundFromProposal(id, pid);
        uint256 streamerBefore = usd.balanceOf(streamer);
        uint256 treasuryBefore = vault.treasuryBalance(creatorId);
        vm.warp(voteEnd);
        clips.finalize(id);
        assertEq(usd.balanceOf(streamer), streamerBefore + 10 * USD);
        assertEq(vault.treasuryBalance(creatorId), treasuryBefore + 20 * USD);
        assertEq(usd.balanceOf(address(clips)), 0);
    }

    function test_unusedPayoutGoesBackToTheTreasury() public {
        uint256 pid = _payout(creatorId, 20 * USD);
        vm.expectRevert(ClipBoard.NotOperator.selector);
        vm.prank(alice);
        clips.returnProposalFunds(pid);

        uint256 before = vault.treasuryBalance(creatorId);
        vm.prank(streamer);
        clips.returnProposalFunds(pid);
        assertEq(vault.treasuryBalance(creatorId), before + 20 * USD);
        assertEq(usd.balanceOf(address(clips)), 0);

        vm.expectRevert(ClipBoard.ProposalUsed.selector);
        vm.prank(streamer);
        clips.returnProposalFunds(pid);
        uint256 id = _bounty(0);
        vm.expectRevert(ClipBoard.ProposalUsed.selector);
        vm.prank(streamer);
        clips.fundFromProposal(id, pid);
    }

    function test_onlyRealPayoutsCanBeAttached() public {
        // a proposal still being voted on
        vm.prank(alice);
        vault.fundTreasury(creatorId, 100 * USD, "seed");
        vm.prank(alice);
        uint256 active = treasury.propose(creatorId, address(clips), 5 * USD, "Not yet");
        uint256 id = _bounty(0);
        vm.expectRevert(ClipBoard.NotAPayout.selector);
        vm.prank(streamer);
        clips.fundFromProposal(id, active);

        // an executed payout to someone else
        vm.prank(alice);
        uint256 toBob = treasury.propose(creatorId, bob, 5 * USD, "For Bob");
        vm.prank(alice);
        treasury.vote(toBob, true);
        // a passed allocation (invests the treasury, pays nobody)
        vm.prank(alice);
        uint256 invest = treasury.proposeAllocation(creatorId, 1_000, "Put some to work");
        vm.prank(alice);
        treasury.vote(invest, true);
        vm.warp(block.timestamp + cfg.votingPeriod);
        treasury.execute(toBob);
        treasury.execute(invest);
        id = _bounty(0);
        vm.startPrank(streamer);
        vm.expectRevert(ClipBoard.NotAPayout.selector);
        clips.fundFromProposal(id, toBob);
        vm.expectRevert(ClipBoard.NotAPayout.selector);
        clips.fundFromProposal(id, invest);
        vm.expectRevert(ClipBoard.NotAPayout.selector);
        clips.fundFromProposal(id, 999);
        vm.stopPrank();
    }

    function test_payoutMustBeForTheSameCreator() public {
        vm.prank(bob);
        uint256 other = registry.register("other", CreatorRegistry.Split({creatorBps: 9_000, treasuryBps: 900, communityBps: 100}));
        uint256 pid = _payout(other, 20 * USD);
        uint256 id = _bounty(0);
        vm.expectRevert(ClipBoard.WrongCreator.selector);
        vm.prank(streamer);
        clips.fundFromProposal(id, pid);
    }

    function test_noFundingAfterFinalize() public {
        uint256 pid = _payout(creatorId, 20 * USD);
        uint256 id = _bounty(0);
        vm.warp(voteEnd);
        clips.finalize(id);
        vm.expectRevert(ClipBoard.BountyClosed.selector);
        vm.prank(streamer);
        clips.fundFromProposal(id, pid);
        // the money is not stuck: it can still go back
        vm.prank(streamer);
        clips.returnProposalFunds(pid);
        assertEq(usd.balanceOf(address(clips)), 0);
    }

    function _filled(uint256 n) internal pure returns (bytes memory b) {
        b = new bytes(n);
        for (uint256 i; i < n; ++i) b[i] = "a";
    }
}
