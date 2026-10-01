// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CreatorRegistry} from "./CreatorRegistry.sol";
import {Character} from "./Character.sol";
import {XPKind} from "./Types.sol";

/// @notice Every dollar flowing to a creator lands here and is split instantly
///         into creator / community treasury / community reward pool buckets.
contract SplitVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev governance contract: spends treasury
    bytes32 public constant TREASURY_SPENDER = keccak256("TREASURY_SPENDER");
    /// @dev jury etc: pays small fees out of the community reward pool
    bytes32 public constant COMMUNITY_SPENDER = keccak256("COMMUNITY_SPENDER");

    /// @dev XP per whole dollar tipped
    uint256 public constant XP_PER_USD = 10;

    IERC20 public immutable token;
    CreatorRegistry public immutable registry;
    Character public immutable character;
    uint256 internal immutable _unit; // 1 USD in token units

    mapping(uint256 => uint256) public creatorBalance;
    mapping(uint256 => uint256) public treasuryBalance;
    mapping(uint256 => uint256) public communityBalance;

    event Deposited(
        uint256 indexed creatorId,
        address indexed from,
        uint256 amount,
        uint256 creatorCut,
        uint256 treasuryCut,
        uint256 communityCut,
        string memo
    );
    event TreasuryFunded(uint256 indexed creatorId, address indexed from, uint256 amount, string reason);
    event CreatorWithdrawn(uint256 indexed creatorId, address indexed to, uint256 amount);
    event TreasurySpent(uint256 indexed creatorId, address indexed to, uint256 amount);
    event CommunitySpent(uint256 indexed creatorId, address indexed to, uint256 amount);

    error ZeroAmount();
    error NotCreator();
    error InsufficientBalance();

    constructor(IERC20 token_, CreatorRegistry registry_, Character character_, uint8 decimals_, address admin) {
        token = token_;
        registry = registry_;
        character = character_;
        _unit = 10 ** decimals_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Tip a creator (or route a won quest pool). Pulls `amount` from
    ///         msg.sender and splits it. XP goes to msg.sender for direct tips.
    function deposit(uint256 creatorId, uint256 amount, string calldata memo) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        CreatorRegistry.Split memory s = registry.splitOf(creatorId);
        token.safeTransferFrom(msg.sender, address(this), amount);

        uint256 treasuryCut = (amount * s.treasuryBps) / registry.BPS();
        uint256 communityCut = (amount * s.communityBps) / registry.BPS();
        uint256 creatorCut = amount - treasuryCut - communityCut; // rounding dust -> creator

        creatorBalance[creatorId] += creatorCut;
        treasuryBalance[creatorId] += treasuryCut;
        communityBalance[creatorId] += communityCut;

        character.grantXP(msg.sender, (amount * XP_PER_USD) / _unit, XPKind.Tip);
        emit Deposited(creatorId, msg.sender, amount, creatorCut, treasuryCut, communityCut, memo);
    }

    /// @notice Sends the whole amount to the community treasury (e.g. failed quest cut).
    function fundTreasury(uint256 creatorId, uint256 amount, string calldata reason) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        registry.ownerOf(creatorId); // existence check
        token.safeTransferFrom(msg.sender, address(this), amount);
        treasuryBalance[creatorId] += amount;
        emit TreasuryFunded(creatorId, msg.sender, amount, reason);
    }

    function withdrawCreator(uint256 creatorId, address to) external nonReentrant returns (uint256 amount) {
        if (registry.ownerOf(creatorId) != msg.sender) revert NotCreator();
        amount = creatorBalance[creatorId];
        if (amount == 0) revert ZeroAmount();
        creatorBalance[creatorId] = 0;
        token.safeTransfer(to, amount);
        emit CreatorWithdrawn(creatorId, to, amount);
    }

    function spendTreasury(uint256 creatorId, address to, uint256 amount) external onlyRole(TREASURY_SPENDER) nonReentrant {
        if (treasuryBalance[creatorId] < amount) revert InsufficientBalance();
        treasuryBalance[creatorId] -= amount;
        token.safeTransfer(to, amount);
        emit TreasurySpent(creatorId, to, amount);
    }

    /// @notice Pays up to `amount` from the community pool; returns what was actually paid.
    function spendCommunity(uint256 creatorId, address to, uint256 amount)
        external
        onlyRole(COMMUNITY_SPENDER)
        nonReentrant
        returns (uint256 paid)
    {
        uint256 bal = communityBalance[creatorId];
        paid = amount > bal ? bal : amount;
        if (paid == 0) return 0;
        communityBalance[creatorId] = bal - paid;
        token.safeTransfer(to, paid);
        emit CommunitySpent(creatorId, to, paid);
    }
}
