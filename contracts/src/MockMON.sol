// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Testnet stand-in for MON as an ERC-20 (18 decimals), so the liquid staking leg can be
///         simulated without real testnet MON. Only the owner and approved minters (the mock LST,
///         which mints its staking rewards) can create it.
contract MockMON is ERC20, Ownable {
    mapping(address => bool) public minters;

    event MinterSet(address indexed minter, bool allowed);

    error NotAMinter();

    constructor() ERC20("Mock MON", "mMON") Ownable(msg.sender) {}

    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != owner() && !minters[msg.sender]) revert NotAMinter();
        _mint(to, amount);
    }
}
