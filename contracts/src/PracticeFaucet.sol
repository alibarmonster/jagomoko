// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSD} from "./MockUSD.sol";

/// @notice The "practice gold" tap for the testnet demo: $100 of MockUSD per claim, once an hour per
///         address. MockUSD's own faucet gives $10 and its amount is a constant, so this contract is
///         made a MockUSD minter instead of redeploying every contract that holds the token.
///         Testnet only: mUSD has no value.
contract PracticeFaucet {
    uint256 public constant AMOUNT = 100e6; // $100
    uint256 public constant COOLDOWN = 1 hours;

    MockUSD public immutable usd;
    mapping(address => uint256) public lastClaim;

    event Claimed(address indexed to, uint256 amount);

    error Cooldown(uint256 nextClaimAt);

    constructor(MockUSD usd_) {
        usd = usd_;
    }

    function claim() external {
        uint256 next = lastClaim[msg.sender] + COOLDOWN;
        if (lastClaim[msg.sender] != 0 && block.timestamp < next) revert Cooldown(next);
        lastClaim[msg.sender] = block.timestamp;
        usd.mint(msg.sender, AMOUNT);
        emit Claimed(msg.sender, AMOUNT);
    }
}
