// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {EnforcedOptionParam} from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import {Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import {StreamQuestDeployer} from "../script/StreamQuestDeployer.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {CommunityTreasury} from "../src/CommunityTreasury.sol";
import {TipReceiver} from "../src/TipReceiver.sol";
import {TipSender} from "../src/TipSender.sol";
import {IPriceFeed} from "../src/interfaces/IPriceFeed.sol";
import {TipMessage} from "../src/libs/TipMessage.sol";

/// @dev Runs v2 against the live testnets instead of mocks (needs network, so it is skipped
///      unless FORK_TESTS=true):
///        FORK_TESTS=true forge test --match-path test/ForkV2.t.sol
///      - Monad: DeployV2's steps on top of the real v1 contracts and LayerZero endpoint, then a
///        delivery and an allocation through the real SplitVault.
///      - Sepolia: a TipSender on the real endpoint and Chainlink feed quotes the real route.
contract ForkV2Test is Test, StreamQuestDeployer {
    using OptionsBuilder for bytes;

    address constant MONAD_ENDPOINT = 0x3aCAAf60502791D199a5a5F0B173D78229eBFe32;
    address constant SEPOLIA_ENDPOINT = 0x6EDCE65403992e310A62460808c4b910D972f10f;
    address constant SEPOLIA_ETH_USD = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
    uint32 constant MONAD_EID = 40442;
    uint32 constant SEPOLIA_EID = 40161;

    function setUp() public {
        if (!vm.envOr("FORK_TESTS", false)) vm.skip(true);
    }

    function test_v2OnTheLiveMonadDeployment() public {
        vm.createSelectFork("monad_testnet");
        string memory json = vm.readFile("deployments/10143.json");
        MockUSD usd = MockUSD(vm.parseJsonAddress(json, ".MockUSD"));
        SplitVault vault = SplitVault(vm.parseJsonAddress(json, ".SplitVault"));
        CommunityTreasury treasury = CommunityTreasury(vm.parseJsonAddress(json, ".CommunityTreasury"));
        IERC4626 stable = IERC4626(vm.parseJsonAddress(json, ".MockYieldVault"));
        address deployer = usd.owner();
        assertEq(vault.totalTreasuryShares(), 0, "something is invested in the old strategy");

        vm.startPrank(deployer);
        Pool memory p = _deployPool(usd, stable, vault, deployer, defaultPoolConfig());
        TipReceiver receiver = _deployTipReceiver(MONAD_ENDPOINT, usd, vault, deployer);
        receiver.setPeer(SEPOLIA_EID, bytes32(uint256(uint160(address(0xBEEF)))));
        vm.stopPrank();
        assertEq(address(vault.strategy()), address(p.pool));

        // a delivery as the real endpoint would make it, into creator 1
        address donor = makeAddr("sepolia-donor");
        uint256 creator0 = vault.creatorBalance(1);
        Origin memory origin = Origin(SEPOLIA_EID, bytes32(uint256(uint160(address(0xBEEF)))), 1);
        vm.prank(MONAD_ENDPOINT);
        receiver.lzReceive(origin, keccak256("guid"), TipMessage.encode(1, donor, 5e6, "gg"), address(this), "");
        assertGt(vault.creatorBalance(1), creator0);

        // an allocation as an executed Allocate proposal applies it
        uint256 treasury0 = vault.treasuryTotal(1);
        vm.prank(address(treasury));
        vault.setTreasuryTarget(1, 5_000);
        vault.rebalance(1);
        assertGt(vault.investedValue(1), 0);
        assertGt(p.pool.lstValue(), 0);
        assertApproxEqRel(vault.treasuryTotal(1), treasury0, 0.01e18);
    }

    function test_tipSenderQuotesTheRealSepoliaRoute() public {
        vm.createSelectFork("sepolia");
        TipSender sender = new TipSender(SEPOLIA_ENDPOINT, MONAD_EID, address(this));
        sender.setAsset(sender.NATIVE(), IPriceFeed(SEPOLIA_ETH_USD));
        sender.setPeer(MONAD_EID, bytes32(uint256(uint160(address(0xBEEF)))));
        EnforcedOptionParam[] memory opts = new EnforcedOptionParam[](1);
        opts[0] = EnforcedOptionParam(MONAD_EID, sender.SEND(), OptionsBuilder.newOptions().addExecutorLzReceiveOption(600_000, 0));
        sender.setEnforcedOptions(opts);

        (uint256 fee, uint256 usdAmount) = sender.quote(sender.NATIVE(), 0.002 ether, 1, "gg");
        emit log_named_uint("0.002 ETH in USD (6 decimals)", usdAmount);
        emit log_named_uint("LayerZero fee to Monad (wei)", fee);
        assertGt(usdAmount, 1e6);
        assertGt(fee, 0);
        assertLt(fee, 0.01 ether);
    }
}
