// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {Character} from "../src/Character.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {XPKind} from "../src/Types.sol";

contract RegistryTest is BaseTest {
    function test_rejectsSplitNotSummingTo100() public {
        vm.expectRevert(CreatorRegistry.InvalidSplit.selector);
        vm.prank(alice);
        registry.register("alice", CreatorRegistry.Split(8_000, 1_000, 500));
    }

    function test_requiresCommunityShare() public {
        vm.expectRevert(CreatorRegistry.InvalidSplit.selector);
        vm.prank(alice);
        registry.register("alice", CreatorRegistry.Split(9_500, 400, 100));
    }

    function test_handleUnique() public {
        vm.expectRevert(CreatorRegistry.HandleTaken.selector);
        vm.prank(alice);
        registry.register("streamer", CreatorRegistry.Split(8_000, 1_500, 500));
    }

    function test_splitChangeIsTimelocked() public {
        vm.startPrank(streamer);
        registry.queueSplit(creatorId, CreatorRegistry.Split(9_000, 500, 500));
        vm.expectRevert(CreatorRegistry.TooEarly.selector);
        registry.applySplit(creatorId);
        vm.warp(block.timestamp + 1 days);
        registry.applySplit(creatorId);
        vm.stopPrank();
        assertEq(registry.splitOf(creatorId).creatorBps, 9_000);
    }

    function test_operators() public view {
        assertTrue(registry.isOperator(creatorId, streamer));
        assertTrue(registry.isOperator(creatorId, mod));
        assertFalse(registry.isOperator(creatorId, alice));
    }
}

contract CharacterTest is BaseTest {
    function test_soulbound() public {
        uint256 id = character.characterOf(alice);
        vm.expectRevert(Character.Soulbound.selector);
        vm.prank(alice);
        character.transferFrom(alice, bob, id);
    }

    function test_onePerAddress() public {
        vm.expectRevert(Character.AlreadyHasCharacter.selector);
        vm.prank(alice);
        character.mint(Character.Role.Seer, "Again");
    }

    function test_onlyGrantersGiveXP() public {
        vm.expectRevert();
        vm.prank(alice);
        character.grantXP(alice, 1_000, XPKind.Back);
    }

    function test_specialtyBonus() public {
        character.grantXP(alice, 100, XPKind.Back); // Knight specialty -> 150
        character.grantXP(alice, 100, XPKind.Predict); // not specialty -> 100
        assertEq(character.xpOf(alice), 250);
    }

    function test_levels() public view {
        assertEq(character.levelForXP(0), 1);
        assertEq(character.levelForXP(99), 1);
        assertEq(character.levelForXP(100), 2);
        assertEq(character.levelForXP(1_600), 5);
    }

    function test_noCharacterNoop() public {
        address nobody = makeAddr("nobody");
        assertEq(character.grantXP(nobody, 100, XPKind.Tip), 0);
    }

    function test_slashFloorsAtZero() public {
        character.grantXP(bob, 10, XPKind.Tip);
        character.slashXP(bob, 50, XPKind.Jury);
        assertEq(character.xpOf(bob), 0);
    }
}

contract VaultTest is BaseTest {
    function test_tipSplitsInstantly() public {
        vm.prank(alice);
        vault.deposit(creatorId, 10 * USD, "gg");
        assertEq(vault.creatorBalance(creatorId), 8 * USD);
        assertEq(vault.treasuryBalance(creatorId), 1.5e6);
        assertEq(vault.communityBalance(creatorId), 0.5e6);
        assertEq(character.xpOf(alice), 100); // 10 XP per $1
    }

    function testFuzz_splitConservesFunds(uint96 amount) public {
        vm.assume(amount > 0);
        usd.mint(alice, amount);
        vm.prank(alice);
        vault.deposit(creatorId, amount, "");
        assertEq(
            vault.creatorBalance(creatorId) + vault.treasuryBalance(creatorId) + vault.communityBalance(creatorId),
            amount
        );
        assertEq(usd.balanceOf(address(vault)), amount);
    }

    function test_onlyCreatorWithdraws() public {
        vm.prank(alice);
        vault.deposit(creatorId, 10 * USD, "");
        vm.expectRevert(SplitVault.NotCreator.selector);
        vm.prank(alice);
        vault.withdrawCreator(creatorId, alice);

        uint256 before = usd.balanceOf(streamer);
        vm.prank(streamer);
        vault.withdrawCreator(creatorId, streamer);
        assertEq(usd.balanceOf(streamer) - before, 8 * USD);
    }

    function test_treasuryOnlyByGovernance() public {
        vm.prank(alice);
        vault.deposit(creatorId, 10 * USD, "");
        vm.expectRevert();
        vm.prank(streamer);
        vault.spendTreasury(creatorId, streamer, 1);
    }
}
