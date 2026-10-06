// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BaseTest} from "./Base.t.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {MockYieldVault} from "../src/MockYieldVault.sol";
import {CommunityTreasury} from "../src/CommunityTreasury.sol";
import {CommunityPoolVault} from "../src/CommunityPoolVault.sol";
import {LstStrategy} from "../src/LstStrategy.sol";
import {MockLST} from "../src/MockLST.sol";
import {MokoSwap} from "../src/MokoSwap.sol";
import {XPKind} from "../src/Types.sol";

/// @dev The pool on top of the v1 system, as DeployV2 builds it. Base split is 80 / 15 / 5, so a
///      $1000 tip puts $150 in the treasury. The pool's default mix is 30% liquid staking.
abstract contract PoolBase is BaseTest {
    Pool p;
    PoolConfig pc;
    MockYieldVault stableVault;
    CommunityPoolVault pool;
    LstStrategy leg;

    function setUp() public virtual override {
        super.setUp();
        stableVault = MockYieldVault(address(vault.strategy()));
        pc = defaultPoolConfig();
        p = _deployPool(usd, IERC4626(address(stableVault)), vault, address(this), pc);
        pool = p.pool;
        leg = p.lstLeg;
        usd.mint(alice, 10_000_000 * USD);
        vm.prank(alice);
        vault.deposit(creatorId, 1_000 * USD, ""); // treasury = $150, all liquid
        character.grantXP(bob, 400, XPKind.Tip); // vote weight 20 (quorum is 10)
    }

    /// @dev sets a treasury's target the way an executed Allocate proposal does, then applies it
    function _invest(uint256 cid, uint16 bps) internal {
        vm.prank(address(treasury));
        vault.setTreasuryTarget(cid, bps);
        vault.rebalance(cid);
    }

    function _pass(uint256 id) internal {
        vm.prank(bob);
        treasury.vote(id, true);
        vm.warp(block.timestamp + cfg.votingPeriod);
        treasury.execute(id);
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

    /// @dev value lost when $x goes into liquid staking and is valued at its instant exit
    function _afterEntry(uint256 x) internal view returns (uint256) {
        uint256 keep = (10_000 - pc.swapFeeBps) * (10_000 - pc.instantFeeBps) * (10_000 - pc.swapFeeBps);
        return (x * keep) / 1e12;
    }
}

contract CommunityPoolTest is PoolBase {
    // ---- wiring ----

    function test_poolIsTheVaultStrategy() public view {
        assertEq(address(vault.strategy()), address(pool));
        assertEq(pool.depositor(), address(vault));
        assertEq(address(pool.stable()), address(stableVault));
        assertEq(address(pool.lstLeg()), address(leg));
        assertEq(leg.pool(), address(pool));
        assertEq(pool.lstBps(), 3_000);
        assertEq(pool.asset(), address(usd));
    }

    // ---- going in ----

    function test_allocationVoteSplitsTheMoneyIntoBothLegs() public {
        vm.prank(carol);
        _pass(treasury.proposeAllocation(creatorId, 4_000, "put the treasury to work"));

        // $60 goes in: $42 to token staking, $18 to liquid staking (worth a little less once in)
        assertApproxEqAbs(pool.stableValue(), 42 * USD, 2);
        assertApproxEqAbs(pool.lstValue(), _afterEntry(18 * USD), 10);
        assertEq(pool.idleAssets(), 0);
        assertApproxEqAbs(vault.treasuryBalance(creatorId), 90 * USD, 1);
        assertApproxEqAbs(vault.investedValue(creatorId), 42 * USD + _afterEntry(18 * USD), 20);
        assertGt(p.lst.balanceOf(address(leg)), 0);
        _assertSolvent();
    }

    function test_eachGuildPaysItsOwnEntryCost() public {
        _invest(creatorId, 5_000);
        uint256 firstValue = vault.investedValue(creatorId);
        uint256 price = pool.convertToAssets(1e9);

        // a second guild puts money in later: the first guild's value does not move
        address dave = makeAddr("dave");
        vm.prank(dave);
        uint256 creator2 = registry.register("dave", CreatorRegistry.Split({creatorBps: 0, treasuryBps: 10_000, communityBps: 0}));
        vm.prank(alice);
        vault.deposit(creator2, 500 * USD, "");
        _invest(creator2, 5_000);

        assertGe(pool.convertToAssets(1e9), price);
        assertGe(vault.investedValue(creatorId) + 1, firstValue);
        // and the second guild carries its own entry cost
        assertApproxEqAbs(vault.investedValue(creator2), 175 * USD + _afterEntry(75 * USD), 50);
    }

    function test_onlyTheSplitVaultCanDeposit() public {
        vm.startPrank(alice);
        usd.approve(address(pool), type(uint256).max);
        vm.expectRevert(CommunityPoolVault.NotDepositor.selector);
        pool.deposit(10 * USD, alice);
        vm.expectRevert(abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxMint.selector, alice, 1e9, 0));
        pool.mint(1e9, alice);
        vm.stopPrank();
    }

    function test_previewDepositNeverPromisesMoreThanDepositMints() public {
        _invest(creatorId, 2_000);
        uint256 promised = pool.previewDeposit(30 * USD);
        uint256 before = pool.balanceOf(address(vault));
        _invest(creatorId, 4_000); // invests $30 more
        assertLe(promised, pool.balanceOf(address(vault)) - before);
    }

    // ---- earning ----

    function test_bothLegsEarn() public {
        _invest(creatorId, 5_000);
        uint256 stable0 = pool.stableValue();
        uint256 lst0 = pool.lstValue();
        uint256 total0 = vault.treasuryTotal(creatorId);

        vm.warp(block.timestamp + 365 days);
        assertApproxEqRel(pool.stableValue(), (stable0 * 108) / 100, 0.001e18); // 8% token staking
        assertApproxEqRel(pool.lstValue(), (lst0 * 110) / 100, 0.001e18); // 10% staking rewards
        assertGt(vault.treasuryTotal(creatorId), total0 + 6 * USD);
    }

    function test_stakingRewardsShowUpRightAway() public {
        _invest(creatorId, 5_000);
        uint256 lst0 = pool.lstValue();
        p.lst.donateRewards(1_000e18); // demo: a lump of staking rewards
        assertGt(pool.lstValue(), lst0);
    }

    // ---- paying out ----

    function test_spendTakesTokenStakingFirstThenLiquidStaking() public {
        _invest(creatorId, 5_000); // $75 in: $52.5 stable, ~$22.4 liquid staking
        uint256 lst0 = pool.lstValue();
        uint256 carol0 = usd.balanceOf(carol);

        _spend(140 * USD); // $75 liquid + $65 from the pool: the whole stable leg and some LST

        assertEq(usd.balanceOf(carol) - carol0, 140 * USD);
        assertEq(pool.stableValue(), 0);
        assertLt(pool.lstValue(), lst0);
        assertGt(pool.lstValue(), 0);
        assertEq(vault.treasuryBalance(creatorId), 0);
        _assertSolvent();
    }

    function test_aSpendOfEverythingStillPays() public {
        _invest(creatorId, 5_000);
        vm.warp(block.timestamp + 30 days);
        // everything the treasury has when the proposal is made (it only grows during the vote)
        uint256 id = _spend(vault.treasuryTotal(creatorId));
        assertEq(uint8(treasury.getProposal(id).status), uint8(CommunityTreasury.Status.Executed));
        _assertSolvent();
    }

    function testFuzz_anyAffordableSpendPays(uint256 amount) public {
        _invest(creatorId, 5_000);
        amount = bound(amount, 1, vault.treasuryTotal(creatorId));
        uint256 carol0 = usd.balanceOf(carol);
        uint256 id = _spend(amount);
        assertEq(uint8(treasury.getProposal(id).status), uint8(CommunityTreasury.Status.Executed));
        assertEq(usd.balanceOf(carol) - carol0, amount);
        _assertSolvent();
    }

    function test_pullingTheTargetToZeroLeavesThePool() public {
        _invest(creatorId, 5_000);
        _invest(creatorId, 0);
        assertEq(vault.treasuryShares(creatorId), 0);
        assertEq(vault.totalTreasuryShares(), 0);
        assertApproxEqAbs(vault.treasuryBalance(creatorId), 75 * USD + 75 * USD - (22_500_000 - _afterEntry(22_500_000)), 50);
        _assertSolvent();
    }

    // ---- the curator's mix ----

    function test_curatorMovesTheMix() public {
        _invest(creatorId, 5_000);
        pool.setMix(5_000);
        assertTrue(pool.rebalanceMix());
        uint256 total = pool.totalAssets();
        assertApproxEqRel(pool.lstValue(), total / 2, 0.01e18);

        pool.setMix(0);
        assertTrue(pool.rebalanceMix());
        assertEq(pool.lstValue(), 0);
        assertEq(leg.shares(), 0);
        assertEq(pool.idleAssets(), 0);
        assertApproxEqRel(pool.stableValue(), total, 0.01e18);
    }

    function test_smallDriftIsLeftAlone() public {
        _invest(creatorId, 5_000);
        assertFalse(pool.rebalanceMix());
    }

    function test_onlyTheCuratorSetsTheMix() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, bob, pool.CURATOR())
        );
        vm.prank(bob);
        pool.setMix(1_000);
    }

    function test_mixIsCappedAtHalf() public {
        vm.expectRevert(CommunityPoolVault.InvalidMix.selector);
        pool.setMix(5_001);
    }

    function test_emergencyExitParksEverythingAndTreasuriesStillPay() public {
        _invest(creatorId, 5_000);
        uint256 total = pool.totalAssets();
        pool.emergencyExit();
        assertTrue(pool.parked());
        assertEq(pool.stableValue(), 0);
        assertEq(pool.lstValue(), 0);
        assertEq(pool.idleAssets(), total);

        // money that comes in while parked stays idle, and spends still work
        _invest(creatorId, 5_000);
        assertEq(pool.stableValue(), 0);
        _spend(100 * USD);
        _assertSolvent();

        pool.resume();
        assertTrue(pool.rebalanceMix());
        assertEq(pool.idleAssets(), 0);
        assertGt(pool.stableValue(), 0);
    }

    function test_onlyTheAdminCanExit() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, bob, pool.DEFAULT_ADMIN_ROLE())
        );
        vm.prank(bob);
        pool.emergencyExit();
    }
}

contract LstStrategyTest is PoolBase {
    function setUp() public override {
        super.setUp();
        _invest(creatorId, 5_000); // ~$22.4 in liquid staking
    }

    function test_onlyThePoolMovesMoney() public {
        vm.expectRevert(LstStrategy.NotPool.selector);
        leg.withdraw(1 * USD, alice);
        vm.expectRevert(LstStrategy.NotPool.selector);
        leg.deposit(1 * USD);
    }

    function test_bindsOnlyOnce() public {
        vm.expectRevert(LstStrategy.AlreadyBound.selector);
        leg.bind(alice);
    }

    function test_leavingCompletelyPaysExactlyTheValue() public {
        uint256 value = leg.totalValue();
        vm.prank(address(pool));
        leg.withdraw(value, alice);
        assertEq(leg.shares(), 0);
        assertEq(leg.totalValue(), 0);
    }

    function testFuzz_withdrawPaysExactlyAndKeepsTheRest(uint256 x) public {
        uint256 before = leg.totalValue();
        x = bound(x, 1, before);
        uint256 alice0 = usd.balanceOf(alice);
        vm.prank(address(pool));
        leg.withdraw(x, alice);
        assertEq(usd.balanceOf(alice) - alice0, x);
        // rounding only ever favours what stays behind
        assertGe(leg.totalValue() + x + 3, before);
    }

    function test_cannotPayMoreThanItHas() public {
        uint256 value = leg.totalValue();
        vm.prank(address(pool));
        vm.expectRevert();
        leg.withdraw(value + 1 * USD, alice);
    }
}

contract MockLSTTest is BaseTest {
    Pool p;
    address staker = makeAddr("staker");

    function setUp() public override {
        super.setUp();
        p = _deployPool(usd, vault.strategy(), vault, address(this), defaultPoolConfig());
        p.mon.mint(staker, 1_000e18);
        vm.prank(staker);
        p.mon.approve(address(p.lst), type(uint256).max);
    }

    function _stake(uint256 amount) internal returns (uint256 shares) {
        vm.prank(staker);
        shares = p.lst.deposit(amount, staker);
    }

    function test_rewardsAccrueAtTheApr() public {
        uint256 shares = _stake(100e18);
        vm.warp(block.timestamp + 365 days);
        assertApproxEqRel(p.lst.previewRedeem(shares), 110e18, 0.0001e18);
    }

    function test_instantRedeemPaysNowMinusTheFee() public {
        uint256 shares = _stake(100e18);
        vm.prank(staker);
        uint256 got = p.lst.instantRedeem(shares, 0, staker);
        assertApproxEqAbs(got, 99.8e18, 1e3);
        assertEq(p.lst.balanceOf(staker), 0);
    }

    function test_theInstantFeeStaysWithTheOtherStakers() public {
        uint256 mine = _stake(100e18);
        p.mon.mint(alice, 100e18);
        vm.startPrank(alice);
        p.mon.approve(address(p.lst), type(uint256).max);
        uint256 theirs = p.lst.deposit(100e18, alice);
        p.lst.instantRedeem(theirs, 0, alice);
        vm.stopPrank();
        assertGt(p.lst.previewRedeem(mine), 100.1e18);
    }

    function test_requestThenClaimAfterUnbonding() public {
        uint256 shares = _stake(100e18);
        vm.prank(staker);
        uint256 id = p.lst.requestRedeem(shares, staker);
        uint256 promised = 100e18 - 1; // rounding

        vm.expectRevert();
        p.lst.claim(id);

        vm.warp(block.timestamp + 10 minutes);
        uint256 got = p.lst.claim(id);
        assertGe(got, promised);
        assertEq(p.mon.balanceOf(staker), 900e18 + got);
        assertEq(p.lst.reserved(), 0);

        vm.expectRevert(MockLST.AlreadyClaimed.selector);
        p.lst.claim(id);
    }

    function test_mmonWaitingToUnbondEarnsNothing() public {
        uint256 shares = _stake(100e18);
        vm.prank(staker);
        uint256 id = p.lst.requestRedeem(shares, staker);
        vm.warp(block.timestamp + 365 days);
        assertLe(p.lst.claim(id), 100e18);
    }

    function test_plainRedeemIsClosed() public {
        uint256 shares = _stake(100e18);
        vm.prank(staker);
        vm.expectRevert(abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxRedeem.selector, staker, shares, 0));
        p.lst.redeem(shares, staker, staker);
    }

    function test_onlyTheOwnerTurnsTheKnobs() public {
        vm.startPrank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        p.lst.setApr(5_000);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        p.lst.donateRewards(1e18);
        vm.stopPrank();
        vm.expectRevert(MockLST.FeeTooHigh.selector);
        p.lst.setInstantFee(101);
    }
}

contract MokoSwapTest is BaseTest {
    Pool p;

    function setUp() public override {
        super.setUp();
        p = _deployPool(usd, vault.strategy(), vault, address(this), defaultPoolConfig());
    }

    function test_quotesAtThePriceMinusTheFee() public view {
        // $1 buys 20 mMON at $0.05, less 0.1%
        assertEq(p.swap.quote(address(usd), 1 * USD), 19.98e18);
        assertEq(p.swap.quote(address(p.mon), 20e18), 999_000);
    }

    function testFuzz_quoteInIsEnough(uint256 out, bool usdIn) public view {
        out = bound(out, 1, 1e30);
        address tokenIn = usdIn ? address(usd) : address(p.mon);
        if (usdIn) out = bound(out, 1, 1e24); // mMON wanted
        else out = bound(out, 1, 1e12); // mUSD wanted
        assertGe(p.swap.quote(tokenIn, p.swap.quoteIn(tokenIn, out)), out);
    }

    function test_swapChecksTheMinimumAndTheInventory() public {
        usd.mint(alice, 1_000_000 * USD);
        vm.startPrank(alice);
        usd.approve(address(p.swap), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(MokoSwap.SlippageTooHigh.selector, 19.98e18, 20e18));
        p.swap.swap(address(usd), 1 * USD, 20e18, alice);
        vm.expectRevert(MokoSwap.NotEnoughInventory.selector);
        p.swap.swap(address(usd), 200_000 * USD, 0, alice); // 4M mMON wanted, 2M seeded
        uint256 out = p.swap.swap(address(usd), 1 * USD, 0, alice);
        vm.stopPrank();
        assertEq(p.mon.balanceOf(alice), out);
    }

    function test_unknownTokensAndBadSettingsAreRefused() public {
        vm.expectRevert(MokoSwap.UnknownToken.selector);
        p.swap.quote(alice, 1);
        vm.expectRevert(MokoSwap.InvalidPrice.selector);
        p.swap.setPrice(0);
        vm.expectRevert(MokoSwap.FeeTooHigh.selector);
        p.swap.setFee(101);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        vm.prank(bob);
        p.swap.setPrice(1);
    }
}
