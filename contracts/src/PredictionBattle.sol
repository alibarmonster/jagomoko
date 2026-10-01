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

/// @notice Viewer-vs-viewer prediction battles ("does the streamer win this
///         match?"). Peer-to-peer pools, no house. The creator and their mods
///         can never take a side. Points mode = free-to-play, XP only.
contract PredictionBattle is OptimisticResolver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant TREASURY_CUT_BPS = 200; // 2% of the losing pool
    uint256 public constant JOIN_XP = 5;
    uint256 public constant WIN_XP = 50;
    uint256 public constant XP_PER_USD_WON = 10;

    IERC20 public immutable token;
    CreatorRegistry public immutable registry;
    Character public immutable character;
    SplitVault public immutable vault;
    uint256 internal immutable _unit;

    struct Battle {
        uint256 creatorId;
        string question;
        string[2] sides; // e.g. ["Win", "Lose"]
        uint64 closeTime;
        bool pointsMode;
        uint256[2] pools;
        uint256[2] players;
        uint256 winnings; // losing pool after treasury cut
        bool refundAll;
    }

    struct Position {
        bool joined;
        uint8 side;
        uint256 stake;
        bool claimed;
    }

    uint256 public battleCount;
    mapping(uint256 => Battle) internal _battles;
    mapping(uint256 => mapping(address => Position)) public positionOf;

    event BattleCreated(uint256 indexed battleId, uint256 indexed creatorId, string question, string sideA, string sideB, uint64 closeTime, bool pointsMode);
    event BattleJoined(uint256 indexed battleId, address indexed player, uint8 side, uint256 amount, uint256 poolA, uint256 poolB);
    event BattleSettled(uint256 indexed battleId, Verdict verdict, bool refundAll, uint256 toTreasury, uint256 winnings);
    event BattleClaimed(uint256 indexed battleId, address indexed player, uint256 payout, uint256 xp);

    error NotOperator();
    error OperatorCannotPlay();
    error BadCloseTime();
    error BadSide();
    error BattleClosed();
    error BattleStillOpen();
    error SideLocked();
    error BadAmount();
    error NotResolved();
    error NothingToClaim();
    error UnknownBattle();

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

    function createBattle(uint256 creatorId, string calldata question, string calldata sideA, string calldata sideB, uint64 closeTime, bool pointsMode)
        external
        returns (uint256 battleId)
    {
        if (!registry.isOperator(creatorId, msg.sender)) revert NotOperator();
        if (closeTime <= block.timestamp) revert BadCloseTime();
        battleId = ++battleCount;
        Battle storage b = _battles[battleId];
        b.creatorId = creatorId;
        b.question = question;
        b.sides[0] = sideA;
        b.sides[1] = sideB;
        b.closeTime = closeTime;
        b.pointsMode = pointsMode;
        emit BattleCreated(battleId, creatorId, question, sideA, sideB, closeTime, pointsMode);
    }

    /// @param amount stake in token units; must be 0 in points mode
    function join(uint256 battleId, uint8 side, uint256 amount) external nonReentrant {
        Battle storage b = _battles[battleId];
        if (b.closeTime == 0) revert UnknownBattle();
        if (side > 1) revert BadSide();
        if (_stage(battleId) != Stage.Open || block.timestamp >= b.closeTime) revert BattleClosed();
        if (registry.isOperator(b.creatorId, msg.sender)) revert OperatorCannotPlay();

        Position storage p = positionOf[battleId][msg.sender];
        if (b.pointsMode) {
            if (amount != 0 || p.joined) revert BadAmount();
        } else {
            if (amount == 0) revert BadAmount();
            if (p.joined && p.side != side) revert SideLocked();
            token.safeTransferFrom(msg.sender, address(this), amount);
        }

        if (!p.joined) {
            p.joined = true;
            p.side = side;
            b.players[side]++;
            character.grantXP(msg.sender, JOIN_XP, XPKind.Predict);
        }
        p.stake += amount;
        b.pools[side] += amount;
        emit BattleJoined(battleId, msg.sender, side, amount, b.pools[0], b.pools[1]);
    }

    /// @param sideAWon true if side A (index 0) won
    function proposeOutcome(uint256 battleId, bool sideAWon, string calldata proofURI) external {
        Battle storage b = _battles[battleId];
        if (b.closeTime == 0) revert UnknownBattle();
        if (!registry.isOperator(b.creatorId, msg.sender)) revert NotOperator();
        if (block.timestamp < b.closeTime) revert BattleStillOpen();
        _propose(battleId, sideAWon ? Verdict.Yes : Verdict.No, proofURI);
    }

    function claim(uint256 battleId) external nonReentrant returns (uint256 payout, uint256 xp) {
        if (_stage(battleId) != Stage.Resolved) revert NotResolved();
        Position storage p = positionOf[battleId][msg.sender];
        if (!p.joined || p.claimed) revert NothingToClaim();
        Battle storage b = _battles[battleId];

        if (b.refundAll) {
            payout = p.stake;
        } else {
            uint8 winner = _resolutions[battleId].verdict == Verdict.Yes ? 0 : 1;
            if (p.side != winner) revert NothingToClaim();
            uint256 profit;
            if (!b.pointsMode) {
                profit = (b.winnings * p.stake) / b.pools[winner];
                payout = p.stake + profit;
            }
            xp = character.grantXP(msg.sender, WIN_XP + (profit * XP_PER_USD_WON) / _unit, XPKind.Predict);
        }
        if (payout == 0 && xp == 0 && b.refundAll) revert NothingToClaim(); // points-mode refund: nothing owed
        p.claimed = true;
        if (payout > 0) token.safeTransfer(msg.sender, payout);
        emit BattleClaimed(battleId, msg.sender, payout, xp);
    }

    function isParticipant(uint256 battleId, address account) public view override returns (bool) {
        return positionOf[battleId][account].joined;
    }

    function getBattle(uint256 battleId) external view returns (Battle memory) {
        return _battles[battleId];
    }

    function _creatorOf(uint256 battleId) internal view override returns (uint256) {
        return _battles[battleId].creatorId;
    }

    function _onResolved(uint256 battleId, Verdict verdict) internal override {
        Battle storage b = _battles[battleId];
        uint256 toTreasury;
        if (verdict == Verdict.Invalid) {
            b.refundAll = true;
        } else if (!b.pointsMode) {
            uint8 winner = verdict == Verdict.Yes ? 0 : 1;
            uint256 losing = b.pools[1 - winner];
            if (b.pools[winner] == 0 || losing == 0) {
                b.refundAll = true; // no counterparty -> everyone gets their stake back
            } else {
                toTreasury = (losing * TREASURY_CUT_BPS) / 10_000;
                b.winnings = losing - toTreasury;
                if (toTreasury > 0) {
                    token.forceApprove(address(vault), toTreasury);
                    vault.fundTreasury(b.creatorId, toTreasury, "Battle cut");
                }
            }
        }
        emit BattleSettled(battleId, verdict, b.refundAll, toTreasury, b.winnings);
    }
}
