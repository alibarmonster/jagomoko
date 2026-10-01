// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Character} from "./Character.sol";
import {SplitVault} from "./SplitVault.sol";
import {IJuryClient, Verdict, XPKind} from "./Types.sol";

/// @notice Community jury for disputed outcomes. Judges (level >= minLevel)
///         enlist; each case samples jurors who have no stake in the market.
///         Majority jurors earn XP + a fee from the creator's community pool,
///         minority jurors lose XP. Tie / no votes => Invalid (full refunds).
/// @dev    MVP randomness is prevrandao-based and therefore biasable by the
///         block proposer. Production should use a VRF.
contract Jury is AccessControl {
    bytes32 public constant CLIENT_ROLE = keccak256("CLIENT_ROLE");

    uint256 public constant HONEST_XP = 100;
    uint256 public constant DISHONEST_SLASH = 50;
    uint256 public constant ABSENT_SLASH = 25;

    Character public immutable character;
    SplitVault public immutable vault;

    uint256 public minLevel;
    uint256 public jurorsPerCase;
    uint64 public voteWindow;
    uint256 public jurorFee;

    address[] internal _pool;
    mapping(address => uint256) internal _poolIndex; // 1-based

    struct Case {
        address client;
        uint256 marketId;
        uint256 creatorId;
        uint64 openedAt;
        bool resolved;
        Verdict verdict;
        uint16 yesVotes;
        uint16 noVotes;
        address[] jurors;
    }

    uint256 public caseCount;
    mapping(uint256 => Case) internal _cases;
    mapping(uint256 => mapping(address => bool)) public isJurorOf;
    mapping(uint256 => mapping(address => Verdict)) public voteOf;

    event JurorEnlisted(address indexed juror);
    event JurorLeft(address indexed juror);
    event CaseOpened(uint256 indexed caseId, address indexed client, uint256 indexed marketId, uint256 creatorId, address[] jurors, uint64 deadline);
    event JuryVoted(uint256 indexed caseId, address indexed juror, Verdict verdict);
    event CaseResolved(uint256 indexed caseId, Verdict verdict, uint16 yesVotes, uint16 noVotes);
    event JurorRewarded(uint256 indexed caseId, address indexed juror, uint256 fee);
    event ParamsSet(uint256 minLevel, uint256 jurorsPerCase, uint64 voteWindow, uint256 jurorFee);

    error NotEligible();
    error AlreadyEnlisted();
    error NotEnlisted();
    error NotJuror();
    error AlreadyVoted();
    error VotingClosed();
    error BadVerdict();
    error TooEarly();
    error AlreadyResolved();

    constructor(Character character_, SplitVault vault_, address admin, uint256 minLevel_, uint256 jurorsPerCase_, uint64 voteWindow_, uint256 jurorFee_) {
        character = character_;
        vault = vault_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _setParams(minLevel_, jurorsPerCase_, voteWindow_, jurorFee_);
    }

    function setParams(uint256 minLevel_, uint256 jurorsPerCase_, uint64 voteWindow_, uint256 jurorFee_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setParams(minLevel_, jurorsPerCase_, voteWindow_, jurorFee_);
    }

    // ---- juror pool ----

    function isEligible(address account) public view returns (bool) {
        return character.hasCharacter(account) && character.roleOf(account) == Character.Role.Judge
            && character.levelOf(account) >= minLevel;
    }

    function enlist() external {
        if (_poolIndex[msg.sender] != 0) revert AlreadyEnlisted();
        if (!isEligible(msg.sender)) revert NotEligible();
        _pool.push(msg.sender);
        _poolIndex[msg.sender] = _pool.length;
        emit JurorEnlisted(msg.sender);
    }

    function leave() external {
        uint256 idx = _poolIndex[msg.sender];
        if (idx == 0) revert NotEnlisted();
        address last = _pool[_pool.length - 1];
        _pool[idx - 1] = last;
        _poolIndex[last] = idx;
        _pool.pop();
        _poolIndex[msg.sender] = 0;
        emit JurorLeft(msg.sender);
    }

    function poolSize() external view returns (uint256) {
        return _pool.length;
    }

    function isEnlisted(address account) external view returns (bool) {
        return _poolIndex[account] != 0;
    }

    // ---- cases ----

    function openCase(uint256 marketId, uint256 creatorId) external onlyRole(CLIENT_ROLE) returns (uint256 caseId) {
        caseId = ++caseCount;
        Case storage c = _cases[caseId];
        c.client = msg.sender;
        c.marketId = marketId;
        c.creatorId = creatorId;
        c.openedAt = uint64(block.timestamp);

        uint256 n = _pool.length;
        if (n > 0) {
            uint256 start = uint256(keccak256(abi.encode(block.prevrandao, caseId, marketId, msg.sender))) % n;
            IJuryClient client = IJuryClient(msg.sender);
            for (uint256 i; i < n && c.jurors.length < jurorsPerCase; ++i) {
                address candidate = _pool[(start + i) % n];
                // re-check eligibility (xp may have been slashed since enlisting)
                if (client.isParticipant(marketId, candidate) || !isEligible(candidate)) continue;
                c.jurors.push(candidate);
                isJurorOf[caseId][candidate] = true;
            }
        }
        emit CaseOpened(caseId, msg.sender, marketId, creatorId, c.jurors, c.openedAt + voteWindow);
    }

    function vote(uint256 caseId, Verdict verdict) external {
        if (verdict != Verdict.Yes && verdict != Verdict.No) revert BadVerdict();
        if (!isJurorOf[caseId][msg.sender]) revert NotJuror();
        Case storage c = _cases[caseId];
        if (c.resolved || block.timestamp >= c.openedAt + voteWindow) revert VotingClosed();
        if (voteOf[caseId][msg.sender] != Verdict.None) revert AlreadyVoted();
        voteOf[caseId][msg.sender] = verdict;
        if (verdict == Verdict.Yes) c.yesVotes++;
        else c.noVotes++;
        emit JuryVoted(caseId, msg.sender, verdict);
    }

    /// @notice Anyone can resolve once the window closed or every juror voted.
    function resolve(uint256 caseId) external {
        Case storage c = _cases[caseId];
        if (c.resolved) revert AlreadyResolved();
        bool allVoted = uint256(c.yesVotes) + c.noVotes == c.jurors.length;
        if (!allVoted && block.timestamp < c.openedAt + voteWindow) revert TooEarly();

        Verdict verdict = c.yesVotes > c.noVotes ? Verdict.Yes : c.noVotes > c.yesVotes ? Verdict.No : Verdict.Invalid;
        c.resolved = true;
        c.verdict = verdict;

        for (uint256 i; i < c.jurors.length; ++i) {
            address juror = c.jurors[i];
            Verdict v = voteOf[caseId][juror];
            if (v == Verdict.None) {
                character.slashXP(juror, ABSENT_SLASH, XPKind.Jury);
            } else if (verdict == Verdict.Invalid) {
                continue;
            } else if (v == verdict) {
                character.grantXP(juror, HONEST_XP, XPKind.Jury);
                uint256 paid = jurorFee == 0 ? 0 : vault.spendCommunity(c.creatorId, juror, jurorFee);
                emit JurorRewarded(caseId, juror, paid);
            } else {
                character.slashXP(juror, DISHONEST_SLASH, XPKind.Jury);
            }
        }

        emit CaseResolved(caseId, verdict, c.yesVotes, c.noVotes);
        IJuryClient(c.client).onJuryVerdict(c.marketId, verdict);
    }

    function getCase(uint256 caseId) external view returns (Case memory) {
        return _cases[caseId];
    }

    function _setParams(uint256 minLevel_, uint256 jurorsPerCase_, uint64 voteWindow_, uint256 jurorFee_) internal {
        minLevel = minLevel_;
        jurorsPerCase = jurorsPerCase_;
        voteWindow = voteWindow_;
        jurorFee = jurorFee_;
        emit ParamsSet(minLevel_, jurorsPerCase_, voteWindow_, jurorFee_);
    }
}
