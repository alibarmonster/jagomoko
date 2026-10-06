// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {EnforcedOptionParam} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {IOAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppCore.sol";
import {OAppReceiver, Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import {BaseTest} from "./Base.t.sol";
import {MockPriceFeed, MockToken6} from "./mocks/MockPriceFeed.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {TipSender} from "../src/TipSender.sol";
import {TipReceiver} from "../src/TipReceiver.sol";
import {IPriceFeed} from "../src/interfaces/IPriceFeed.sol";
import {TipMessage} from "../src/libs/TipMessage.sol";

/// @dev Two simulated LayerZero endpoints in one EVM: eid 1 plays Sepolia (TipSender), eid 2
///      plays Monad (TipReceiver + the jagomoko system). verifyPackets delivers with exactly the
///      enforced gas, so a passing test also proves the gas limit is enough.
contract CrossChainTipTest is BaseTest, TestHelperOz5 {
    using OptionsBuilder for bytes;

    uint32 constant SRC = 1;
    uint32 constant DST = 2;
    /// @dev keep in sync with DeployTipSender.RECEIVE_GAS
    uint128 constant RECEIVE_GAS = 600_000;
    address constant NATIVE = address(0);

    TipSender sender;
    TipReceiver receiver;
    MockPriceFeed ethUsd;
    address donor = makeAddr("donor"); // a wallet on the source chain, no character on Monad

    function setUp() public override(BaseTest, TestHelperOz5) {
        BaseTest.setUp();
        TestHelperOz5.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        receiver = _deployTipReceiver(endpoints[DST], usd, vault, address(this));
        sender = new TipSender(endpoints[SRC], DST, address(this));
        ethUsd = new MockPriceFeed(8, 2_500e8); // $2,500 per ETH
        sender.setAsset(NATIVE, IPriceFeed(address(ethUsd)));
        sender.setPeer(DST, addressToBytes32(address(receiver)));
        receiver.setPeer(SRC, addressToBytes32(address(sender)));
        _enforceGas(sender, RECEIVE_GAS);

        vm.deal(donor, 10 ether);
        vm.deal(alice, 10 ether);
    }

    function _enforceGas(TipSender s, uint128 gas) internal {
        EnforcedOptionParam[] memory opts = new EnforcedOptionParam[](1);
        opts[0] = EnforcedOptionParam(DST, s.SEND(), OptionsBuilder.newOptions().addExecutorLzReceiveOption(gas, 0));
        s.setEnforcedOptions(opts);
    }

    /// @dev tips `wei_` of ETH from `who` to `cid` and delivers it on Monad
    function _tipEth(address who, uint256 wei_, uint256 cid, string memory memo) internal {
        (uint256 fee,) = sender.quote(NATIVE, wei_, cid, memo);
        vm.prank(who);
        sender.tip{value: wei_ + fee}(NATIVE, wei_, cid, memo);
        verifyPackets(DST, addressToBytes32(address(receiver)));
    }

    struct Seen {
        bool found;
        uint256 creatorId;
        address from;
        uint256 amount;
        string memo;
    }

    /// @dev the Deposited event the vault emitted since vm.recordLogs()
    function _deposited() internal returns (Seen memory d) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(vault) || logs[i].topics[0] != SplitVault.Deposited.selector) continue;
            d.found = true;
            d.creatorId = uint256(logs[i].topics[1]);
            d.from = address(uint160(uint256(logs[i].topics[2])));
            (d.amount,,,, d.memo) = abi.decode(logs[i].data, (uint256, uint256, uint256, uint256, string));
        }
    }

    /// @dev the reason of the TipBounced event the receiver emitted since vm.recordLogs() (0 = none)
    function _bounced() internal returns (uint8 reason, address donor, uint256 amount) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(receiver) || logs[i].topics[0] != TipReceiver.TipBounced.selector) continue;
            donor = address(uint160(uint256(logs[i].topics[3])));
            (, amount, reason) = abi.decode(logs[i].data, (uint256, uint256, uint8));
        }
    }

    // ---- the happy path ----

    function test_anEthTipLandsInTheCreatorsSplit() public {
        uint256 creator0 = vault.creatorBalance(creatorId);
        uint256 treasury0 = vault.treasuryBalance(creatorId);
        uint256 supply0 = usd.totalSupply();

        vm.recordLogs();
        _tipEth(donor, 0.002 ether, creatorId, "gg from Sepolia"); // $5 at $2,500
        Seen memory d = _deposited();
        assertTrue(d.found);
        assertEq(d.creatorId, creatorId);
        assertEq(d.from, donor); // credited to the wallet that paid on Sepolia
        assertEq(d.amount, 5 * USD);
        assertEq(d.memo, "gg from Sepolia");

        assertEq(vault.creatorBalance(creatorId) - creator0, 4 * USD);
        assertEq(vault.treasuryBalance(creatorId) - treasury0, 0.75e6);
        assertEq(usd.totalSupply() - supply0, 5 * USD); // minted against the ETH held on the source
        assertEq(address(sender).balance, 0.002 ether);
        assertEq(usd.balanceOf(address(receiver)), 0);
        assertEq(character.xpOf(donor), 0); // no character on Monad: no XP, no membership
    }

    function test_theMemoAndTheAnonymousMarkerTravel() public {
        vm.recordLogs();
        _tipEth(donor, 0.002 ether, creatorId, "[anon] love the stream");
        assertEq(_deposited().memo, "[anon] love the stream");
    }

    function test_theSameAddressWithACharacterEarnsXp() public {
        uint256 xp0 = character.xpOf(alice);
        _tipEth(alice, 0.002 ether, creatorId, "");
        assertEq(character.xpOf(alice) - xp0, 50); // 10 XP per dollar, like any tip
    }

    function test_crossChainTipIsAnnouncedBeforeTheDeposit() public {
        vm.recordLogs();
        _tipEth(donor, 0.002 ether, creatorId, "order");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 tipTopic = TipReceiver.CrossChainTip.selector;
        bytes32 depositTopic = SplitVault.Deposited.selector;
        uint256 tipAt = type(uint256).max;
        uint256 depositAt = type(uint256).max;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(receiver) && logs[i].topics[0] == tipTopic) tipAt = i;
            if (logs[i].emitter == address(vault) && logs[i].topics[0] == depositTopic) depositAt = i;
        }
        assertLt(tipAt, depositAt);
        assertLt(depositAt, logs.length);
    }

    function test_anAllowedTokenWorksToo() public {
        MockToken6 usdc = new MockToken6();
        MockPriceFeed usdcUsd = new MockPriceFeed(8, 1e8);
        sender.setAsset(address(usdc), IPriceFeed(address(usdcUsd)));
        usdc.mint(donor, 100e6);

        (uint256 fee, uint256 usdAmount) = sender.quote(address(usdc), 7e6, creatorId, "");
        assertEq(usdAmount, 7 * USD);
        vm.startPrank(donor);
        usdc.approve(address(sender), 7e6);
        sender.tip{value: fee}(address(usdc), 7e6, creatorId, "");
        vm.stopPrank();
        verifyPackets(DST, addressToBytes32(address(receiver)));

        assertEq(usdc.balanceOf(address(sender)), 7e6);
        assertEq(vault.creatorBalance(creatorId), 5.6e6);
    }

    function test_overpaidFeeIsRefunded() public {
        (uint256 fee,) = sender.quote(NATIVE, 0.002 ether, creatorId, "");
        uint256 before = donor.balance;
        vm.prank(donor);
        sender.tip{value: 0.002 ether + fee + 1 ether}(NATIVE, 0.002 ether, creatorId, "");
        assertEq(before - donor.balance, 0.002 ether + fee);
    }

    // ---- what the sender refuses ----

    function test_onlyAllowedAssets() public {
        MockToken6 junk = new MockToken6();
        vm.expectRevert(abi.encodeWithSelector(TipSender.AssetNotAllowed.selector, address(junk)));
        vm.prank(donor);
        sender.tip(address(junk), 5e6, creatorId, "");

        sender.setAsset(NATIVE, IPriceFeed(address(0))); // the owner can take an asset off the list
        vm.expectRevert(abi.encodeWithSelector(TipSender.AssetNotAllowed.selector, NATIVE));
        vm.prank(donor);
        sender.tip{value: 1 ether}(NATIVE, 0.002 ether, creatorId, "");
    }

    function test_tipLimits() public {
        vm.startPrank(donor);
        vm.expectRevert(abi.encodeWithSelector(TipSender.TipTooSmall.selector, 0.5e6, 1e6));
        sender.tip{value: 1 ether}(NATIVE, 0.0002 ether, creatorId, ""); // $0.50
        vm.expectRevert(abi.encodeWithSelector(TipSender.TipTooLarge.selector, 125e6, 100e6));
        sender.tip{value: 1 ether}(NATIVE, 0.05 ether, creatorId, ""); // $125
        vm.stopPrank();
    }

    function test_staleOrBrokenPricesAreRefused() public {
        vm.warp(block.timestamp + 3 hours + 1);
        vm.expectRevert(abi.encodeWithSelector(TipSender.StalePrice.selector, ethUsd.updatedAt()));
        vm.prank(donor);
        sender.tip{value: 1 ether}(NATIVE, 0.002 ether, creatorId, "");

        ethUsd.set(0);
        vm.expectRevert(TipSender.BadPrice.selector);
        sender.usdValue(NATIVE, 1 ether);
    }

    function test_memoLengthAndFeeAreChecked() public {
        bytes memory long = new bytes(201);
        for (uint256 i; i < long.length; ++i) long[i] = "a";
        vm.startPrank(donor);
        vm.expectRevert(TipSender.MemoTooLong.selector);
        sender.tip{value: 1 ether}(NATIVE, 0.002 ether, creatorId, string(long));
        vm.expectRevert(TipSender.FeeMissing.selector);
        sender.tip{value: 0.002 ether}(NATIVE, 0.002 ether, creatorId, "");
        vm.stopPrank();
    }

    function test_aSenderWithoutGasOptionsRefusesToSend() public {
        TipSender bare = new TipSender(endpoints[SRC], DST, address(this));
        bare.setAsset(NATIVE, IPriceFeed(address(ethUsd)));
        bare.setPeer(DST, addressToBytes32(address(receiver)));
        vm.expectRevert(TipSender.NoGasOption.selector);
        vm.prank(donor);
        bare.tip{value: 1 ether}(NATIVE, 0.002 ether, creatorId, "");
    }

    function test_pauseStopsTips() public {
        sender.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(donor);
        sender.tip{value: 1 ether}(NATIVE, 0.002 ether, creatorId, "");
    }

    function test_ownerTakesOutHeldTipsAndOnlyTheOwnerCan() public {
        _tipEth(donor, 0.002 ether, creatorId, "");
        address safe = makeAddr("safe");
        sender.withdraw(NATIVE, safe, 0.002 ether);
        assertEq(safe.balance, 0.002 ether);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, donor));
        vm.prank(donor);
        sender.withdraw(NATIVE, donor, 1);
    }

    // ---- what the receiver does with a bad tip (it never reverts) ----

    function test_anUnknownCreatorBouncesToTheDonorOnMonad() public {
        vm.recordLogs();
        _tipEth(donor, 0.002 ether, 999, "");
        (uint8 reason, address who, uint256 amount) = _bounced();
        assertEq(reason, receiver.BOUNCE_DEPOSIT());
        assertEq(who, donor);
        assertEq(amount, 5 * USD);
        assertEq(usd.balanceOf(donor), 5 * USD);
        assertEq(usd.balanceOf(address(receiver)), 0);
    }

    function test_overTheReceiverLimitMintsNothing() public {
        receiver.setLimits(2 * USD, 10 * USD);
        uint256 supply0 = usd.totalSupply();
        vm.recordLogs();
        _tipEth(donor, 0.002 ether, creatorId, "");
        (uint8 reason,,) = _bounced();
        assertEq(reason, receiver.BOUNCE_LIMIT());
        assertEq(usd.totalSupply(), supply0);
    }

    function test_dailyCapResetsTheNextDay() public {
        receiver.setLimits(5 * USD, 10 * USD);
        _tipEth(donor, 0.002 ether, creatorId, "1");
        _tipEth(donor, 0.002 ether, creatorId, "2");
        uint256 creator0 = vault.creatorBalance(creatorId);
        _tipEth(donor, 0.002 ether, creatorId, "3"); // over the $10 cap: bounced
        assertEq(vault.creatorBalance(creatorId), creator0);

        vm.warp(block.timestamp + 1 days);
        ethUsd.set(2_500e8);
        _tipEth(donor, 0.002 ether, creatorId, "4");
        assertEq(vault.creatorBalance(creatorId) - creator0, 4 * USD);
    }

    function test_onlyTheEndpointAndThePeerCanDeliver() public {
        Origin memory origin = Origin(SRC, addressToBytes32(address(sender)), 1);
        bytes memory message = TipMessage.encode(creatorId, donor, 5 * USD, "forged");
        vm.expectRevert(abi.encodeWithSelector(OAppReceiver.OnlyEndpoint.selector, donor));
        vm.prank(donor);
        receiver.lzReceive(origin, bytes32(uint256(1)), message, donor, "");

        origin.sender = addressToBytes32(donor);
        vm.expectRevert(abi.encodeWithSelector(IOAppCore.OnlyPeer.selector, SRC, addressToBytes32(donor)));
        vm.prank(endpoints[DST]);
        receiver.lzReceive(origin, bytes32(uint256(1)), message, donor, "");
    }

    // ---- gas on Monad ----

    /// @dev The heaviest delivery: a donor with a character (XP write), a brand-new creator (three
    ///      empty buckets filled), the longest memo. Monad prices cold accounts at 10,100 gas and
    ///      cold storage pages at 8,100 (Ethereum: 2,600 / 2,100), which this EVM does not model,
    ///      so it must fit in HALF the enforced gas here, leaving the other half for that.
    function test_theHeaviestTipFitsWithRoomForMonadPricing() public {
        _enforceGas(sender, RECEIVE_GAS / 2);
        address fresh = makeAddr("fresh");
        vm.prank(fresh);
        uint256 cid = registry.register("fresh", CreatorRegistry.Split({creatorBps: 8_000, treasuryBps: 1_500, communityBps: 500}));
        bytes memory long = new bytes(200);
        for (uint256 i; i < long.length; ++i) long[i] = "z";

        uint256 xp0 = character.xpOf(alice);
        _tipEth(alice, 0.04 ether, cid, string(long)); // $100: a big XP grant
        assertEq(vault.creatorBalance(cid), 80 * USD);
        assertEq(character.xpOf(alice) - xp0, 1_000);
    }
}
