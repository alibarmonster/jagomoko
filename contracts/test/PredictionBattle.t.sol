// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {PredictionBattle} from "../src/PredictionBattle.sol";
import {Verdict} from "../src/Types.sol";

contract PredictionBattleTest is BaseTest {
    uint256 battleId;
    uint256 pointsId;

    function setUp() public override {
        super.setUp();
        vm.startPrank(streamer);
        battleId = battles.createBattle(creatorId, "Does the streamer win this Valorant match?", "Win", "Lose", uint64(block.timestamp + 5 minutes), false);
        pointsId = battles.createBattle(creatorId, "First blood?", "Yes", "No", uint64(block.timestamp + 5 minutes), true);
        vm.stopPrank();
    }

    function _settle(uint256 id, bool sideAWon) internal {
        vm.warp(block.timestamp + 5 minutes);
        vm.prank(streamer);
        battles.proposeOutcome(id, sideAWon, "https://tracker.gg/match/1");
        vm.warp(block.timestamp + cfg.challengeWindow);
        battles.finalize(id);
    }

    function test_creatorAndModsCannotPlay() public {
        vm.startPrank(streamer);
        usd.approve(address(battles), type(uint256).max);
        vm.expectRevert(PredictionBattle.OperatorCannotPlay.selector);
        battles.join(battleId, 1, USD);
        vm.stopPrank();

        vm.expectRevert(PredictionBattle.OperatorCannotPlay.selector);
        vm.prank(mod);
        battles.join(battleId, 1, USD);
    }

    function test_winnersSplitLosingPool() public {
        vm.prank(alice);
        battles.join(battleId, 0, 10 * USD);
        vm.prank(carol);
        battles.join(battleId, 0, 30 * USD);
        vm.prank(bob);
        battles.join(battleId, 1, 50 * USD);

        _settle(battleId, true); // "Win"

        // 2% of 50 -> treasury, 49 split 1:3
        assertEq(vault.treasuryBalance(creatorId), 1 * USD);
        uint256 a0 = usd.balanceOf(alice);
        vm.prank(alice);
        (uint256 payout,) = battles.claim(battleId);
        assertEq(payout, 10 * USD + 12.25e6);
        assertEq(usd.balanceOf(alice) - a0, payout);

        vm.prank(carol);
        (uint256 payoutC,) = battles.claim(battleId);
        assertEq(payoutC, 30 * USD + 36.75e6);

        vm.expectRevert(PredictionBattle.NothingToClaim.selector);
        vm.prank(bob);
        battles.claim(battleId);
    }

    function test_oneSidedBattleRefunds() public {
        vm.prank(alice);
        battles.join(battleId, 0, 10 * USD);
        _settle(battleId, false);
        uint256 a0 = usd.balanceOf(alice);
        vm.prank(alice);
        battles.claim(battleId);
        assertEq(usd.balanceOf(alice) - a0, 10 * USD);
        assertEq(vault.treasuryBalance(creatorId), 0);
    }

    function test_cannotSwitchSides() public {
        vm.startPrank(alice);
        battles.join(battleId, 0, USD);
        vm.expectRevert(PredictionBattle.SideLocked.selector);
        battles.join(battleId, 1, USD);
        vm.stopPrank();
    }

    function test_closedAfterCloseTime() public {
        vm.warp(block.timestamp + 5 minutes);
        vm.expectRevert(PredictionBattle.BattleClosed.selector);
        vm.prank(alice);
        battles.join(battleId, 0, USD);
    }

    function test_cannotProposeBeforeClose() public {
        vm.expectRevert(PredictionBattle.BattleStillOpen.selector);
        vm.prank(streamer);
        battles.proposeOutcome(battleId, true, "");
    }

    function test_pointsModeGivesSeerXPOnly() public {
        vm.prank(bob); // Seer
        battles.join(pointsId, 0, 0);
        vm.prank(alice);
        battles.join(pointsId, 1, 0);

        vm.expectRevert(PredictionBattle.BadAmount.selector);
        vm.prank(carol);
        battles.join(pointsId, 0, USD);

        _settle(pointsId, true);
        uint256 xp0 = character.xpOf(bob);
        vm.prank(bob);
        (uint256 payout, uint256 xp) = battles.claim(pointsId);
        assertEq(payout, 0);
        assertEq(xp, 75); // 50 * 1.5 Seer bonus
        assertEq(character.xpOf(bob) - xp0, 75);
    }

    function test_juryInvalidRefundsEveryone() public {
        vm.prank(alice);
        battles.join(battleId, 0, 10 * USD);
        vm.prank(bob);
        battles.join(battleId, 1, 10 * USD);
        vm.warp(block.timestamp + 5 minutes);
        vm.prank(streamer);
        battles.proposeOutcome(battleId, true, "");
        vm.prank(bob);
        battles.dispute(battleId);
        jury.resolve(battles.resolutionOf(battleId).caseId); // no jurors -> Invalid

        uint256 b0 = usd.balanceOf(bob);
        vm.prank(bob);
        battles.claim(battleId);
        assertEq(usd.balanceOf(bob) - b0, 10 * USD);
    }
}
