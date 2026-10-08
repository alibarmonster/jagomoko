// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {PracticeFaucet} from "../src/PracticeFaucet.sol";

contract PracticeFaucetTest is Test {
    MockUSD usd;
    PracticeFaucet faucet;
    address alice = makeAddr("alice");

    function setUp() public {
        vm.warp(1_800_000_000);
        usd = new MockUSD();
        faucet = new PracticeFaucet(usd);
        usd.setMinter(address(faucet), true);
    }

    function test_claimGivesOneHundredDollars() public {
        vm.prank(alice);
        faucet.claim();
        assertEq(usd.balanceOf(alice), 100e6);
        assertEq(faucet.lastClaim(alice), block.timestamp);
    }

    function test_claimWaitsAnHour() public {
        vm.prank(alice);
        faucet.claim();

        vm.warp(block.timestamp + 59 minutes);
        vm.expectRevert(abi.encodeWithSelector(PracticeFaucet.Cooldown.selector, faucet.lastClaim(alice) + 1 hours));
        vm.prank(alice);
        faucet.claim();

        vm.warp(block.timestamp + 1 minutes);
        vm.prank(alice);
        faucet.claim();
        assertEq(usd.balanceOf(alice), 200e6);
    }

    function test_eachAddressHasItsOwnCooldown() public {
        vm.prank(alice);
        faucet.claim();
        address bob = makeAddr("bob");
        vm.prank(bob);
        faucet.claim();
        assertEq(usd.balanceOf(bob), 100e6);
    }

    function test_needsToBeAMinter() public {
        usd.setMinter(address(faucet), false);
        vm.expectRevert("MockUSD: not a minter");
        vm.prank(alice);
        faucet.claim();
    }
}
