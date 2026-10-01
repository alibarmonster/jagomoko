// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CreatorRegistry} from "./CreatorRegistry.sol";
import {Character} from "./Character.sol";
import {SplitVault} from "./SplitVault.sol";
import {Jury} from "./Jury.sol";
import {OptimisticResolver} from "./OptimisticResolver.sol";
import {Verdict, XPKind} from "./Types.sol";

/// @notice Crowdfunded stream challenges ("beat the boss in < 1h").
///         Success -> pool flows through the creator's SplitVault.
///         Fail    -> 90% refundable to backers pro-rata, 10% to the treasury.
///         Invalid -> 100% refundable.
contract QuestEscrow is OptimisticResolver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FAIL_TREASURY_BPS = 1_000; // 10%
    uint256 public constant XP_PER_USD = 10;
    uint256 public constant COMPLETE_BONUS_XP = 25;
    /// @dev after goalDeadline + grace anyone may propose failure so funds never get stuck
    uint64 public constant STALE_GRACE = 1 hours;

    IERC20 public immutable token;
    CreatorRegistry public immutable registry;
    Character public immutable character;
    SplitVault public immutable vault;
    uint256 internal immutable _unit;

    struct Quest {
        uint256 creatorId;
        string title;
        uint64 goalDeadline;
        uint256 pool;
        uint256 refundable; // set on resolution
        uint256 backers;
    }

    uint256 public questCount;
    mapping(uint256 => Quest) internal _quests;
    mapping(uint256 => mapping(address => uint256)) public backedOf;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event QuestCreated(uint256 indexed questId, uint256 indexed creatorId, string title, uint64 goalDeadline);
    event QuestBacked(uint256 indexed questId, address indexed backer, uint256 amount, uint256 newPool);
    event QuestSettled(uint256 indexed questId, Verdict verdict, uint256 toCreatorVault, uint256 toTreasury, uint256 refundable);
    event QuestClaimed(uint256 indexed questId, address indexed backer, uint256 refund);

    error NotOperator();
    error BadDeadline();
    error QuestClosed();
    error ZeroAmount();
    error NotResolved();
    error NothingToClaim();
    error CannotProposeYet();
    error UnknownQuest();

    constructor(
        IERC20 token_,
        CreatorRegistry registry_,
        Character character_,
        SplitVault vault_,
        Jury jury_,
        uint64 challengeWindow_,
        uint8 decimals_
    ) OptimisticResolver(jury_, challengeWindow_) {
        token = token_;
        registry = registry_;
        character = character_;
        vault = vault_;
        _unit = 10 ** decimals_;
    }

    function createQuest(uint256 creatorId, string calldata title, uint64 goalDeadline) external returns (uint256 questId) {
        if (!registry.isOperator(creatorId, msg.sender)) revert NotOperator();
        if (goalDeadline <= block.timestamp) revert BadDeadline();
        questId = ++questCount;
        Quest storage q = _quests[questId];
        q.creatorId = creatorId;
        q.title = title;
        q.goalDeadline = goalDeadline;
        emit QuestCreated(questId, creatorId, title, goalDeadline);
    }

    /// @notice Pledge to a quest. Open until the goal deadline or an outcome is proposed.
    function back(uint256 questId, uint256 amount) external nonReentrant {
        Quest storage q = _quests[questId];
        if (q.goalDeadline == 0) revert UnknownQuest();
        if (amount == 0) revert ZeroAmount();
        if (_stage(questId) != Stage.Open || block.timestamp >= q.goalDeadline) revert QuestClosed();

        token.safeTransferFrom(msg.sender, address(this), amount);
        if (backedOf[questId][msg.sender] == 0) q.backers++;
        backedOf[questId][msg.sender] += amount;
        q.pool += amount;

        character.grantXP(msg.sender, (amount * XP_PER_USD) / _unit, XPKind.Back);
        emit QuestBacked(questId, msg.sender, amount, q.pool);
    }

    /// @notice Creator/mod reports the outcome (with a VOD/clip link as proof).
    ///         Success can be claimed any time before the deadline passes; failure
    ///         any time. After deadline + grace, anyone may report failure.
    function proposeOutcome(uint256 questId, bool success, string calldata proofURI) external {
        Quest storage q = _quests[questId];
        if (q.goalDeadline == 0) revert UnknownQuest();
        bool operator = registry.isOperator(q.creatorId, msg.sender);
        if (!operator) {
            if (success || block.timestamp < q.goalDeadline + STALE_GRACE) revert NotOperator();
        }
        _propose(questId, success ? Verdict.Yes : Verdict.No, proofURI);
    }

    function claim(uint256 questId) external nonReentrant returns (uint256 refund) {
        if (_stage(questId) != Stage.Resolved) revert NotResolved();
        uint256 backed = backedOf[questId][msg.sender];
        if (backed == 0 || claimed[questId][msg.sender]) revert NothingToClaim();
        claimed[questId][msg.sender] = true;

        Quest storage q = _quests[questId];
        refund = (q.refundable * backed) / q.pool;
        if (refund > 0) token.safeTransfer(msg.sender, refund);
        if (_resolutions[questId].verdict == Verdict.Yes) {
            character.grantXP(msg.sender, COMPLETE_BONUS_XP, XPKind.Back);
        }
        emit QuestClaimed(questId, msg.sender, refund);
    }

    function isParticipant(uint256 questId, address account) public view override returns (bool) {
        return backedOf[questId][account] > 0;
    }

    function getQuest(uint256 questId) external view returns (Quest memory) {
        return _quests[questId];
    }

    function _creatorOf(uint256 questId) internal view override returns (uint256) {
        return _quests[questId].creatorId;
    }

    function _onResolved(uint256 questId, Verdict verdict) internal override {
        Quest storage q = _quests[questId];
        uint256 pool = q.pool;
        uint256 toVault;
        uint256 toTreasury;

        if (verdict == Verdict.Yes) {
            toVault = pool;
        } else if (verdict == Verdict.No) {
            toTreasury = (pool * FAIL_TREASURY_BPS) / 10_000;
            q.refundable = pool - toTreasury;
        } else {
            q.refundable = pool;
        }

        if (toVault > 0) {
            token.forceApprove(address(vault), toVault);
            vault.deposit(q.creatorId, toVault, string.concat("Quest complete: ", q.title));
        }
        if (toTreasury > 0) {
            token.forceApprove(address(vault), toTreasury);
            vault.fundTreasury(q.creatorId, toTreasury, "Quest failed");
        }
        emit QuestSettled(questId, verdict, toVault, toTreasury, q.refundable);
    }
}
