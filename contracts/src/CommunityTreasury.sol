// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreatorRegistry} from "./CreatorRegistry.sol";
import {Character} from "./Character.sol";
import {SplitVault} from "./SplitVault.sol";
import {XPKind} from "./Types.sol";

/// @notice "Of the community, by the community, for the community."
///         Characters propose treasury spends; votes are weighted by sqrt(XP).
///         The creator keeps a veto during the MVP as a safety valve.
contract CommunityTreasury {
    uint256 public constant PROPOSE_XP = 10;
    uint256 public constant VOTE_XP = 5;

    CreatorRegistry public immutable registry;
    Character public immutable character;
    SplitVault public immutable vault;
    uint64 public immutable votingPeriod;
    uint256 public immutable quorum; // minimum total sqrt(XP) weight voting "for"

    enum Status {
        Active,
        Executed,
        Defeated,
        Vetoed
    }

    struct Proposal {
        uint256 creatorId;
        address proposer;
        address recipient;
        uint256 amount;
        string description;
        uint64 endsAt;
        uint256 forWeight;
        uint256 againstWeight;
        Status status;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) internal _proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed proposalId, uint256 indexed creatorId, address indexed proposer, address recipient, uint256 amount, string description, uint64 endsAt);
    event ProposalVoted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalFinalized(uint256 indexed proposalId, Status status);

    error NoCharacter();
    error NoWeight();
    error ZeroAmount();
    error VotingEnded();
    error VotingActive();
    error AlreadyVoted();
    error NotActive();
    error NotCreator();

    constructor(CreatorRegistry registry_, Character character_, SplitVault vault_, uint64 votingPeriod_, uint256 quorum_) {
        registry = registry_;
        character = character_;
        vault = vault_;
        votingPeriod = votingPeriod_;
        quorum = quorum_;
    }

    function propose(uint256 creatorId, address recipient, uint256 amount, string calldata description) external returns (uint256 id) {
        registry.ownerOf(creatorId);
        if (!character.hasCharacter(msg.sender)) revert NoCharacter();
        if (amount == 0) revert ZeroAmount();
        id = ++proposalCount;
        Proposal storage p = _proposals[id];
        p.creatorId = creatorId;
        p.proposer = msg.sender;
        p.recipient = recipient;
        p.amount = amount;
        p.description = description;
        p.endsAt = uint64(block.timestamp) + votingPeriod;
        character.grantXP(msg.sender, PROPOSE_XP, XPKind.Governance);
        emit ProposalCreated(id, creatorId, msg.sender, recipient, amount, description, p.endsAt);
    }

    function vote(uint256 id, bool support) external {
        Proposal storage p = _proposals[id];
        if (p.status != Status.Active) revert NotActive();
        if (block.timestamp >= p.endsAt) revert VotingEnded();
        if (hasVoted[id][msg.sender]) revert AlreadyVoted();
        // XP is soulbound, so one address = one character = one weighted vote
        uint256 weight = character.votingWeight(msg.sender);
        if (weight == 0) revert NoWeight();
        hasVoted[id][msg.sender] = true;
        if (support) p.forWeight += weight;
        else p.againstWeight += weight;
        character.grantXP(msg.sender, VOTE_XP, XPKind.Governance);
        emit ProposalVoted(id, msg.sender, support, weight);
    }

    /// @notice After voting ends: executes (pays out) if passed, else marks defeated.
    function execute(uint256 id) external {
        Proposal storage p = _proposals[id];
        if (p.status != Status.Active) revert NotActive();
        if (block.timestamp < p.endsAt) revert VotingActive();
        bool passed = p.forWeight > p.againstWeight && p.forWeight >= quorum
            && vault.treasuryBalance(p.creatorId) >= p.amount;
        p.status = passed ? Status.Executed : Status.Defeated;
        if (passed) vault.spendTreasury(p.creatorId, p.recipient, p.amount);
        emit ProposalFinalized(id, p.status);
    }

    function veto(uint256 id) external {
        Proposal storage p = _proposals[id];
        if (registry.ownerOf(p.creatorId) != msg.sender) revert NotCreator();
        if (p.status != Status.Active) revert NotActive();
        p.status = Status.Vetoed;
        emit ProposalFinalized(id, Status.Vetoed);
    }

    function getProposal(uint256 id) external view returns (Proposal memory) {
        return _proposals[id];
    }
}
