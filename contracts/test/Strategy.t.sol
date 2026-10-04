// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BaseTest} from "./Base.t.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {MockYieldVault} from "../src/MockYieldVault.sol";
import {CommunityTreasury} from "../src/CommunityTreasury.sol";
import {XPKind} from "../src/Types.sol";

/// @dev Base split in these tests is 80 / 15 / 5, so a $1000 tip puts $150 in the treasury.
contract DepositForTest is BaseTest {
    address relayer = makeAddr("relayer");

    function setUp() public override {
        super.setUp();
        vault.grantRole(vault.DEPOSIT_RELAYER(), relayer);
        usd.mint(relayer, 1_000 * USD);
        vm.prank(relayer);
        usd.approve(address(vault), type(uint256).max);
    }

    function test_creditsXpAndEventToTheDonor() public {
        uint256 xp0 = character.xpOf(alice);
        uint256 relayer0 = usd.balanceOf(relayer);

        vm.expectEmit(true, true, false, true, address(vault));
        emit SplitVault.Deposited(creatorId, alice, 100 * USD, 80 * USD, 15 * USD, 5 * USD, "from Ethereum");
        vm.prank(relayer);
        vault.depositFor(creatorId, 100 * USD, alice, "from Ethereum");

        assertEq(character.xpOf(alice) - xp0, 1_000); // 10 XP per dollar
        assertEq(usd.balanceOf(relayer), relayer0 - 100 * USD); // the relayer paid, not alice
        assertEq(vault.creatorBalance(creatorId), 80 * USD);
        assertEq(vault.treasuryBalance(creatorId), 15 * USD);
        assertEq(vault.communityBalance(creatorId), 5 * USD);
    }

    function test_donorWithoutACharacterJustGetsNoXp() public {
        address stranger = makeAddr("stranger");
        vm.prank(relayer);
        vault.depositFor(creatorId, 10 * USD, stranger, "");
        assertEq(character.xpOf(stranger), 0);
        assertEq(vault.creatorBalance(creatorId), 8 * USD);
    }

    function test_onlyTheRelayerCanCreditADonor() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, bob, vault.DEPOSIT_RELAYER())
        );
        vm.prank(bob);
        vault.depositFor(creatorId, 10 * USD, alice, "forged alert");
    }

    function test_zeroAmountReverts() public {
        vm.expectRevert(SplitVault.ZeroAmount.selector);
        vm.prank(relayer);
        vault.depositFor(creatorId, 0, alice, "");
    }
}

contract TreasuryStrategyTest is BaseTest {
    MockYieldVault strat;
    address sink = makeAddr("sink");

    function setUp() public override {
        super.setUp();
        strat = MockYieldVault(address(vault.strategy()));
        usd.mint(alice, 10_000_000 * USD);
        vm.prank(alice);
        vault.deposit(creatorId, 1_000 * USD, ""); // treasury = $150, all liquid
        character.grantXP(bob, 400, XPKind.Tip); // vote weight 20 (quorum is 10)
    }

    // ---- helpers ----

    function _pass(uint256 id) internal {
        vm.prank(bob);
        treasury.vote(id, true);
        vm.warp(block.timestamp + cfg.votingPeriod);
        treasury.execute(id);
    }

    function _allocate(uint16 bps) internal {
        vm.prank(carol);
        _pass(treasury.proposeAllocation(creatorId, bps, "put the treasury to work"));
    }

    function _spend(uint256 amount) internal returns (uint256 id) {
        vm.prank(carol);
        id = treasury.propose(creatorId, carol, amount, "spend");
        _pass(id);
    }

    function _assertSolvent() internal view {
        assertGe(
            usd.balanceOf(address(vault)),
            vault.creatorBalance(creatorId) + vault.treasuryBalance(creatorId) + vault.communityBalance(creatorId)
        );
    }

    // ---- governance ----

    function test_allocationProposalInvestsRightAway() public {
        _allocate(3_000);
        assertEq(vault.treasuryTargetBps(creatorId), 3_000);
        assertApproxEqAbs(vault.investedValue(creatorId), 45 * USD, 1);
        assertApproxEqAbs(vault.treasuryBalance(creatorId), 105 * USD, 1);
        assertApproxEqAbs(vault.treasuryTotal(creatorId), 150 * USD, 2);
        assertGt(vault.totalTreasuryShares(), 0);
        _assertSolvent();
    }

    function test_proposalIsMarkedAsAnAllocation() public {
        vm.prank(carol);
        uint256 id = treasury.proposeAllocation(creatorId, 2_500, "x");
        CommunityTreasury.Proposal memory p = treasury.getProposal(id);
        assertEq(uint8(p.kind), uint8(CommunityTreasury.Kind.Allocate));
        assertEq(p.amount, 2_500);
        assertEq(p.recipient, address(0));
    }

    function test_allocationAboveTheCapIsRejected() public {
        vm.expectRevert(CommunityTreasury.InvalidAllocation.selector);
        vm.prank(carol);
        treasury.proposeAllocation(creatorId, 5_001, "too much");

        vm.expectRevert(SplitVault.InvalidTarget.selector);
        vm.prank(address(treasury));
        vault.setTreasuryTarget(creatorId, 5_001);
    }

    function test_onlyGovernanceSetsTheTarget() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, vault.TREASURY_SPENDER())
        );
        vm.prank(alice);
        vault.setTreasuryTarget(creatorId, 1_000);
    }

    function test_allocationNeedsACharacterAndAStrategy() public {
        vm.expectRevert(CommunityTreasury.NoCharacter.selector);
        vm.prank(streamer);
        treasury.proposeAllocation(creatorId, 1_000, "x");

        vault.setStrategy(IERC4626(address(0)));
        vm.expectRevert(CommunityTreasury.NoStrategy.selector);
        vm.prank(carol);
        treasury.proposeAllocation(creatorId, 1_000, "x");
    }

    function test_creatorCanVetoAnAllocation() public {
        vm.prank(carol);
        uint256 id = treasury.proposeAllocation(creatorId, 5_000, "x");
        vm.prank(bob);
        treasury.vote(id, true);
        vm.prank(streamer);
        treasury.veto(id);
        vm.warp(block.timestamp + cfg.votingPeriod);
        vm.expectRevert(CommunityTreasury.NotActive.selector);
        treasury.execute(id);
        assertEq(vault.treasuryTargetBps(creatorId), 0);
        assertEq(vault.investedValue(creatorId), 0);
    }

    // ---- yield ----

    function test_yieldRaisesTheTotalButNotTheLiquidBalance() public {
        _allocate(3_000);
        uint256 liquid = vault.treasuryBalance(creatorId);
        vm.warp(block.timestamp + 365 days);
        // $45 at 8% for a year
        assertApproxEqAbs(vault.investedValue(creatorId), 48_600_000, 5);
        assertEq(vault.treasuryBalance(creatorId), liquid);
        assertGt(vault.treasuryTotal(creatorId), 150 * USD);
    }

    function test_communityPoolAndCreatorFundsAreNeverInvested() public {
        uint256 creatorBal = vault.creatorBalance(creatorId);
        uint256 communityBal = vault.communityBalance(creatorId);
        _allocate(5_000);
        assertEq(vault.creatorBalance(creatorId), creatorBal);
        assertEq(vault.communityBalance(creatorId), communityBal);
        assertEq(usd.balanceOf(address(vault)), creatorBal + communityBal + vault.treasuryBalance(creatorId));
    }

    // ---- spending ----

    function test_spendPullsTheShortfallOutOfTheStrategy() public {
        _allocate(5_000); // $75 liquid, $75 invested
        uint256 carol0 = usd.balanceOf(carol);
        uint256 id = _spend(100 * USD);
        assertEq(uint8(treasury.getProposal(id).status), uint8(CommunityTreasury.Status.Executed));
        assertEq(usd.balanceOf(carol) - carol0, 100 * USD);
        assertApproxEqAbs(vault.treasuryTotal(creatorId), 50 * USD, 20_000); // a day of yield on $75
        _assertSolvent();
    }

    function test_spendBiggerThanTheTotalIsDefeatedNotStuck() public {
        _allocate(5_000);
        uint256 id = _spend(151 * USD);
        assertEq(uint8(treasury.getProposal(id).status), uint8(CommunityTreasury.Status.Defeated));
    }

    function test_aStrategyLossShowsUpAndCannotBeOverspent() public {
        _allocate(5_000); // $75 invested
        vm.prank(address(strat));
        usd.transfer(sink, 30 * USD); // the strategy loses $30
        assertApproxEqAbs(vault.treasuryTotal(creatorId), 120 * USD, 20_000);

        uint256 tooMuch = _spend(130 * USD);
        assertEq(uint8(treasury.getProposal(tooMuch).status), uint8(CommunityTreasury.Status.Defeated));

        uint256 fits = _spend(110 * USD);
        assertEq(uint8(treasury.getProposal(fits).status), uint8(CommunityTreasury.Status.Executed));
        _assertSolvent();
    }

    // ---- rebalance ----

    function test_smallDriftIsIgnoredBigDriftIsNot() public {
        _allocate(3_000);
        uint256 invested = vault.investedValue(creatorId);

        vm.prank(alice);
        vault.deposit(creatorId, 10 * USD, ""); // +$1.50, under 1% of the treasury
        assertFalse(vault.rebalance(creatorId));
        assertEq(vault.investedValue(creatorId), invested);

        vm.prank(alice);
        vault.deposit(creatorId, 1_000 * USD, ""); // +$150
        assertTrue(vault.rebalance(creatorId));
        assertGt(vault.investedValue(creatorId), invested + 40 * USD);
    }

    function test_targetZeroPullsEverythingBack() public {
        _allocate(3_000);
        _allocate(0);
        assertEq(vault.treasuryShares(creatorId), 0);
        assertEq(vault.totalTreasuryShares(), 0);
        assertEq(vault.investedValue(creatorId), 0);
        assertGe(vault.treasuryBalance(creatorId), 150 * USD - 2);
        _assertSolvent();
    }

    function test_rebalanceWithoutAStrategyReverts() public {
        vault.setStrategy(IERC4626(address(0)));
        vm.expectRevert(SplitVault.NoStrategy.selector);
        vault.rebalance(creatorId);
    }

    // ---- admin ----

    function test_adminCanExitAndStopReinvesting() public {
        _allocate(3_000);
        vault.exitStrategy(creatorId);
        assertEq(vault.investedValue(creatorId), 0);
        assertEq(vault.treasuryTargetBps(creatorId), 0);
        assertFalse(vault.rebalance(creatorId)); // nothing to do, target is zero
        assertEq(vault.investedValue(creatorId), 0);
    }

    function test_onlyAdminExits() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, bob, vault.DEFAULT_ADMIN_ROLE())
        );
        vm.prank(bob);
        vault.exitStrategy(creatorId);
    }

    function test_strategyCannotChangeWhileMoneyIsInIt() public {
        _allocate(3_000);
        vm.expectRevert(SplitVault.StrategyInUse.selector);
        vault.setStrategy(IERC4626(address(0)));
    }

    function test_strategyMustUseTheSameToken() public {
        vault.setStrategy(IERC4626(address(0)));
        MockYieldVault other = new MockYieldVault(new MockUSD(), 0);
        vm.expectRevert(SplitVault.WrongAsset.selector);
        vault.setStrategy(other);
    }

    // ---- fuzz ----

    function testFuzz_treasuryTotalIsConserved(uint256 tip, uint16 bps, uint256 spendSeed, uint32 elapsed) public {
        tip = bound(tip, 10 * USD, 1_000_000 * USD);
        bps = uint16(bound(bps, 0, 5_000));
        vm.prank(alice);
        vault.deposit(creatorId, tip, "");
        uint256 total0 = vault.treasuryTotal(creatorId);

        vm.prank(address(treasury));
        vault.setTreasuryTarget(creatorId, bps);
        vault.rebalance(creatorId);
        assertApproxEqAbs(vault.treasuryTotal(creatorId), total0, 3);

        vm.warp(block.timestamp + elapsed);
        uint256 total1 = vault.treasuryTotal(creatorId);
        assertGe(total1 + 3, total0); // yield is never negative

        uint256 spend = bound(spendSeed, 0, total1);
        if (spend > 0) {
            uint256 carol0 = usd.balanceOf(carol);
            vm.prank(address(treasury));
            vault.spendTreasury(creatorId, carol, spend);
            assertEq(usd.balanceOf(carol) - carol0, spend);
        }
        assertApproxEqAbs(vault.treasuryTotal(creatorId), total1 - spend, 3);
        _assertSolvent();
    }
}

contract MockYieldVaultTest is BaseTest {
    MockYieldVault strat;
    address attacker = makeAddr("attacker");
    address victim = makeAddr("victim");

    function setUp() public override {
        super.setUp();
        strat = MockYieldVault(address(vault.strategy()));
        usd.mint(alice, 1_000_000 * USD);
        vm.prank(alice);
        usd.approve(address(strat), type(uint256).max);
    }

    function test_sharePriceRisesWithTheApr() public {
        vm.prank(alice);
        uint256 shares = strat.deposit(1_000 * USD, alice);
        vm.warp(block.timestamp + 365 days);
        assertApproxEqAbs(strat.convertToAssets(shares), 1_080 * USD, 1_100); // 8% a year (virtual-share rounding)
        assertApproxEqAbs(strat.totalAssets(), 1_080 * USD, 1);

        strat.accrue();
        assertApproxEqAbs(usd.balanceOf(address(strat)), 1_080 * USD, 1);
        assertEq(strat.pendingYield(), 0);
    }

    function test_withdrawWorksBeforeYieldIsMinted() public {
        vm.prank(alice);
        strat.deposit(1_000 * USD, alice);
        vm.warp(block.timestamp + 365 days);
        uint256 bal0 = usd.balanceOf(alice);
        uint256 shares = strat.balanceOf(alice);
        vm.prank(alice);
        strat.redeem(shares, alice, alice);
        assertApproxEqAbs(usd.balanceOf(alice) - bal0, 1_080 * USD, 1_100);
    }

    function test_changingTheRateNeverAppliesRetroactively() public {
        vm.prank(alice);
        strat.deposit(1_000 * USD, alice);
        vm.warp(block.timestamp + 365 days);
        strat.setApr(0);
        vm.warp(block.timestamp + 365 days);
        assertApproxEqAbs(strat.totalAssets(), 1_080 * USD, 1);
    }

    function test_aprIsCapped() public {
        uint256 tooHigh = strat.MAX_APR_BPS() + 1;
        vm.expectRevert(MockYieldVault.AprTooHigh.selector);
        strat.setApr(tooHigh);
    }

    function test_onlyTheOwnerTouchesTheKnobs() public {
        vm.startPrank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        strat.setApr(1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        strat.donateYield(1);
        vm.stopPrank();
    }

    function test_donatedYieldLiftsEveryone() public {
        vm.prank(alice);
        strat.deposit(1_000 * USD, alice);
        strat.donateYield(100 * USD);
        assertApproxEqAbs(strat.convertToAssets(strat.balanceOf(alice)), 1_100 * USD, 1_100);
    }

    /// @dev first-depositor inflation attack: 1 wei deposit, then a donation to skew the share price
    function test_inflationAttackLosesMoney() public {
        usd.mint(attacker, 20_000 * USD);
        usd.mint(victim, 5_000 * USD);

        vm.startPrank(attacker);
        usd.approve(address(strat), type(uint256).max);
        strat.deposit(1, attacker);
        usd.transfer(address(strat), 10_000 * USD); // the donation
        vm.stopPrank();

        vm.startPrank(victim);
        usd.approve(address(strat), type(uint256).max);
        strat.deposit(5_000 * USD, victim);
        vm.stopPrank();

        uint256 victimValue = strat.convertToAssets(strat.balanceOf(victim));
        uint256 attackerValue = strat.convertToAssets(strat.balanceOf(attacker));
        assertGt(victimValue, 4_990 * USD); // the victim is essentially whole
        assertLt(attackerValue, 10_000 * USD / 2 + 10 * USD); // the attacker burned about half the donation
    }
}

contract MockUSDMintersTest is BaseTest {
    function test_onlyOwnerAndMintersMint() public {
        vm.expectRevert("MockUSD: not a minter");
        vm.prank(bob);
        usd.mint(bob, 1);

        usd.setMinter(bob, true);
        vm.prank(bob);
        usd.mint(bob, 5);

        usd.setMinter(bob, false);
        vm.expectRevert("MockUSD: not a minter");
        vm.prank(bob);
        usd.mint(bob, 1);
    }

    function test_onlyOwnerManagesMinters() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        vm.prank(bob);
        usd.setMinter(bob, true);
    }
}
