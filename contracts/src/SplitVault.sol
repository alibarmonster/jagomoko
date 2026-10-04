// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CreatorRegistry} from "./CreatorRegistry.sol";
import {Character} from "./Character.sol";
import {XPKind} from "./Types.sol";

/// @notice Every dollar flowing to a creator lands here and is split instantly
///         into creator / community treasury / community reward pool buckets.
///
///         The treasury bucket can be put to work: the community may vote to park up to
///         MAX_INVEST_BPS of a creator's treasury in one admin-approved ERC-4626 strategy.
///         The community reward pool is never invested: it pays juror fees and has to stay liquid.
contract SplitVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev governance contract: spends and allocates the treasury
    bytes32 public constant TREASURY_SPENDER = keccak256("TREASURY_SPENDER");
    /// @dev jury etc: pays small fees out of the community reward pool
    bytes32 public constant COMMUNITY_SPENDER = keccak256("COMMUNITY_SPENDER");
    /// @dev the cross-chain receiver: may credit a deposit (XP + event) to the original donor
    bytes32 public constant DEPOSIT_RELAYER = keccak256("DEPOSIT_RELAYER");

    /// @dev XP per whole dollar tipped
    uint256 public constant XP_PER_USD = 10;
    /// @dev most of a creator's treasury the community can allocate to the strategy
    uint16 public constant MAX_INVEST_BPS = 5_000;
    /// @dev a rebalance smaller than this share of the treasury is skipped (keeps it dust-proof)
    uint16 public constant MIN_REBALANCE_BPS = 100;

    IERC20 public immutable token;
    CreatorRegistry public immutable registry;
    Character public immutable character;
    uint256 internal immutable _unit; // 1 USD in token units

    mapping(uint256 => uint256) public creatorBalance;
    /// @dev the LIQUID part of the treasury. The invested part is `treasuryShares`; see treasuryTotal().
    mapping(uint256 => uint256) public treasuryBalance;
    mapping(uint256 => uint256) public communityBalance;

    /// @dev the strategy every creator's treasury allocation goes into (zero = none)
    IERC4626 public strategy;
    /// @dev strategy shares this vault holds on behalf of each creator's treasury
    mapping(uint256 => uint256) public treasuryShares;
    uint256 public totalTreasuryShares;
    /// @dev what share of the treasury the community wants invested
    mapping(uint256 => uint16) public treasuryTargetBps;

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
    event StrategySet(address indexed strategy);
    event TreasuryTargetSet(uint256 indexed creatorId, uint16 bps);
    event TreasuryInvested(uint256 indexed creatorId, uint256 assets, uint256 shares);
    event TreasuryDivested(uint256 indexed creatorId, uint256 assets, uint256 shares);

    error ZeroAmount();
    error NotCreator();
    error InsufficientBalance();
    error InvalidTarget();
    error NoStrategy();
    error StrategyInUse();
    error WrongAsset();

    constructor(IERC20 token_, CreatorRegistry registry_, Character character_, uint8 decimals_, address admin) {
        token = token_;
        registry = registry_;
        character = character_;
        _unit = 10 ** decimals_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ---- deposits ----

    /// @notice Tip a creator (or route a won quest pool). Pulls `amount` from
    ///         msg.sender and splits it. XP goes to msg.sender for direct tips.
    function deposit(uint256 creatorId, uint256 amount, string calldata memo) external nonReentrant {
        _deposit(creatorId, amount, msg.sender, msg.sender, memo);
    }

    /// @notice Same as deposit, but the money comes from msg.sender (the cross-chain receiver)
    ///         while the XP and the `Deposited.from` field go to the original `donor`.
    ///         Restricted: crediting a deposit to a third party would let anyone forge
    ///         "Alice tipped $50" alerts on a stream overlay.
    function depositFor(uint256 creatorId, uint256 amount, address donor, string calldata memo)
        external
        onlyRole(DEPOSIT_RELAYER)
        nonReentrant
    {
        _deposit(creatorId, amount, msg.sender, donor, memo);
    }

    function _deposit(uint256 creatorId, uint256 amount, address payer, address donor, string calldata memo) internal {
        if (amount == 0) revert ZeroAmount();
        CreatorRegistry.Split memory s = registry.splitOf(creatorId);
        token.safeTransferFrom(payer, address(this), amount);

        uint256 treasuryCut = (amount * s.treasuryBps) / registry.BPS();
        uint256 communityCut = (amount * s.communityBps) / registry.BPS();
        uint256 creatorCut = amount - treasuryCut - communityCut; // rounding dust -> creator

        creatorBalance[creatorId] += creatorCut;
        treasuryBalance[creatorId] += treasuryCut;
        communityBalance[creatorId] += communityCut;

        character.grantXP(donor, (amount * XP_PER_USD) / _unit, XPKind.Tip);
        emit Deposited(creatorId, donor, amount, creatorCut, treasuryCut, communityCut, memo);
    }

    /// @notice Sends the whole amount to the community treasury (e.g. failed quest cut).
    function fundTreasury(uint256 creatorId, uint256 amount, string calldata reason) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        registry.ownerOf(creatorId); // existence check
        token.safeTransferFrom(msg.sender, address(this), amount);
        treasuryBalance[creatorId] += amount;
        emit TreasuryFunded(creatorId, msg.sender, amount, reason);
    }

    // ---- payouts ----

    function withdrawCreator(uint256 creatorId, address to) external nonReentrant returns (uint256 amount) {
        if (registry.ownerOf(creatorId) != msg.sender) revert NotCreator();
        amount = creatorBalance[creatorId];
        if (amount == 0) revert ZeroAmount();
        creatorBalance[creatorId] = 0;
        token.safeTransfer(to, amount);
        emit CreatorWithdrawn(creatorId, to, amount);
    }

    /// @notice Pays `amount` out of the treasury. If the liquid part is short, the shortfall
    ///         is pulled out of the strategy first, so an approved spend can never be stranded.
    function spendTreasury(uint256 creatorId, address to, uint256 amount)
        external
        onlyRole(TREASURY_SPENDER)
        nonReentrant
    {
        uint256 liquid = treasuryBalance[creatorId];
        if (liquid < amount) {
            if (treasuryShares[creatorId] == 0) revert InsufficientBalance();
            _divestAssets(creatorId, amount - liquid);
        }
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

    // ---- treasury yield ----

    /// @notice What the invested part of a creator's treasury would pay out right now.
    function investedValue(uint256 creatorId) public view returns (uint256) {
        uint256 shares = treasuryShares[creatorId];
        return shares == 0 ? 0 : strategy.previewRedeem(shares);
    }

    /// @notice Liquid + invested. This is the number the community actually has.
    function treasuryTotal(uint256 creatorId) public view returns (uint256) {
        return treasuryBalance[creatorId] + investedValue(creatorId);
    }

    /// @notice Admin picks the one strategy all treasuries use. Can only change while nothing is invested.
    function setStrategy(IERC4626 newStrategy) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (totalTreasuryShares != 0) revert StrategyInUse();
        if (address(newStrategy) != address(0) && newStrategy.asset() != address(token)) revert WrongAsset();
        strategy = newStrategy;
        emit StrategySet(address(newStrategy));
    }

    /// @notice Governance sets how much of a treasury should be invested. Takes effect on rebalance().
    function setTreasuryTarget(uint256 creatorId, uint16 bps) external onlyRole(TREASURY_SPENDER) {
        if (bps > MAX_INVEST_BPS) revert InvalidTarget();
        if (bps != 0 && address(strategy) == address(0)) revert NoStrategy();
        registry.ownerOf(creatorId); // existence check
        treasuryTargetBps[creatorId] = bps;
        emit TreasuryTargetSet(creatorId, bps);
    }

    /// @notice Moves the treasury toward its target allocation. Anyone can call it (a keeper, or
    ///         a button in the UI). Drift under MIN_REBALANCE_BPS is ignored, except that a target
    ///         of zero always exits fully.
    function rebalance(uint256 creatorId) external nonReentrant returns (bool moved) {
        if (address(strategy) == address(0)) revert NoStrategy();
        uint256 invested = investedValue(creatorId);
        uint256 total = treasuryBalance[creatorId] + invested;
        uint16 targetBps = treasuryTargetBps[creatorId];
        uint256 target = (total * targetBps) / registry.BPS();
        uint256 minMove = (total * MIN_REBALANCE_BPS) / registry.BPS();

        if (target > invested) {
            uint256 delta = target - invested;
            if (delta == 0 || delta < minMove) return false;
            _invest(creatorId, delta);
            return true;
        }
        if (invested > target) {
            if (targetBps == 0) {
                _divestShares(creatorId, treasuryShares[creatorId]);
                return true;
            }
            uint256 excess = invested - target;
            if (excess < minMove) return false;
            _divestAssets(creatorId, excess);
            return true;
        }
        return false;
    }

    /// @notice Safety valve: pulls a treasury fully out of the strategy and stops reinvesting it.
    function exitStrategy(uint256 creatorId) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        treasuryTargetBps[creatorId] = 0;
        emit TreasuryTargetSet(creatorId, 0);
        _divestShares(creatorId, treasuryShares[creatorId]);
    }

    // The strategy is an external contract, so every movement is measured from real balance
    // changes rather than trusted return values.

    function _invest(uint256 creatorId, uint256 assets) internal {
        IERC4626 s = strategy;
        uint256 tokenBefore = token.balanceOf(address(this));
        uint256 sharesBefore = s.balanceOf(address(this));
        token.forceApprove(address(s), assets);
        s.deposit(assets, address(this));
        token.forceApprove(address(s), 0);
        uint256 spent = tokenBefore - token.balanceOf(address(this));
        uint256 minted = s.balanceOf(address(this)) - sharesBefore;
        treasuryBalance[creatorId] -= spent;
        treasuryShares[creatorId] += minted;
        totalTreasuryShares += minted;
        emit TreasuryInvested(creatorId, spent, minted);
    }

    function _divestShares(uint256 creatorId, uint256 shares) internal {
        if (shares == 0) return;
        IERC4626 s = strategy;
        uint256 tokenBefore = token.balanceOf(address(this));
        uint256 sharesBefore = s.balanceOf(address(this));
        s.redeem(shares, address(this), address(this));
        uint256 got = token.balanceOf(address(this)) - tokenBefore;
        uint256 burned = sharesBefore - s.balanceOf(address(this));
        treasuryShares[creatorId] -= burned;
        totalTreasuryShares -= burned;
        treasuryBalance[creatorId] += got;
        emit TreasuryDivested(creatorId, got, burned);
    }

    /// @dev redeems enough shares to free `assets` (or everything, if that is all there is)
    function _divestAssets(uint256 creatorId, uint256 assets) internal {
        uint256 shares = strategy.previewWithdraw(assets);
        uint256 held = treasuryShares[creatorId];
        _divestShares(creatorId, shares > held ? held : shares);
    }
}
