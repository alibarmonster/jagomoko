// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CreatorRegistry} from "./CreatorRegistry.sol";
import {Character} from "./Character.sol";
import {SplitVault} from "./SplitVault.sol";
import {CommunityTreasury} from "./CommunityTreasury.sol";
import {XPKind} from "./Types.sol";

/// @notice Clip bounties: the Bard's game. A creator (or one of their mods) posts a bounty, Bards
///         submit links to their clips, the community votes with sqrt(XP) weight, and the clip with
///         the most weight takes the reward.
///
///         The reward can come from two places, and one bounty can use both:
///         - the creator, escrowed here when the bounty is created;
///         - the community treasury: a Spend proposal that paid this contract, once it has passed
///           and been executed, is attached to a bounty with fundFromProposal.
///         When nobody wins, each part goes back where it came from.
///
///         Links are only emitted, never stored. The indexer validates them before any screen
///         shows one.
contract ClipBoard is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant SUBMIT_XP = 20;
    uint256 public constant VOTE_XP = 5;
    /// @dev to a clip's author for each of its first MAX_REWARDED_VOTES votes
    uint256 public constant VOTE_RECEIVED_XP = 5;
    uint256 public constant MAX_REWARDED_VOTES = 20;
    /// @dev to the winner, when the reward is worth at least a dollar
    uint256 public constant WIN_XP = 300;
    uint256 public constant MAX_CLIPS = 50;
    uint256 public constant MAX_TITLE_BYTES = 80;
    uint256 public constant MAX_URL_BYTES = 256;
    /// @dev shortest submit or vote window (a live demo uses a few minutes)
    uint64 public constant MIN_WINDOW = 1 minutes;
    /// @dev longest a bounty can run, from creation to the end of voting
    uint64 public constant MAX_DURATION = 30 days;

    IERC20 public immutable token;
    CreatorRegistry public immutable registry;
    Character public immutable character;
    SplitVault public immutable vault;
    CommunityTreasury public immutable treasury;
    uint256 internal immutable _unit; // 1 USD in token units

    struct Bounty {
        uint256 creatorId;
        address funder; // who escrowed the creator's part; it goes back to them if nobody wins
        uint64 submitEnd; // submissions close, voting opens
        uint64 voteEnd;
        uint256 escrow;
        uint256 communityFunds;
        uint256 winningClip; // 0 = none
        bool finalized;
        string title;
    }

    struct Clip {
        uint256 bountyId;
        address author;
        uint256 weight; // total sqrt(XP) of its voters
        uint256 votes;
        bool hidden;
    }

    uint256 public bountyCount;
    uint256 public clipCount;
    mapping(uint256 => Bounty) internal _bounties;
    mapping(uint256 => Clip) internal _clips;
    mapping(uint256 => uint256[]) internal _clipsOf;
    /// @dev bountyId => Bard => submitted already
    mapping(uint256 => mapping(address => bool)) public hasSubmitted;
    /// @dev bountyId => voter => the clip they voted for (0 = none)
    mapping(uint256 => mapping(address => uint256)) public votedClip;
    /// @dev a treasury payout to this contract is used once: attached to a bounty, or sent back
    mapping(uint256 => bool) public proposalUsed;

    event BountyCreated(
        uint256 indexed bountyId,
        uint256 indexed creatorId,
        address indexed by,
        string title,
        uint256 reward,
        uint64 submitEnd,
        uint64 voteEnd
    );
    event BountyFunded(uint256 indexed bountyId, uint256 indexed proposalId, uint256 amount);
    event ProposalFundsReturned(uint256 indexed proposalId, uint256 indexed creatorId, uint256 amount);
    event ClipSubmitted(uint256 indexed clipId, uint256 indexed bountyId, address indexed author, string url);
    event ClipVoted(uint256 indexed clipId, uint256 indexed bountyId, address indexed voter, uint256 weight);
    event ClipHidden(uint256 indexed clipId, uint256 indexed bountyId, bool hidden);
    event BountyWon(uint256 indexed bountyId, uint256 indexed clipId, address indexed author, uint256 amount);
    event BountyRefunded(uint256 indexed bountyId, uint256 toFunder, uint256 toTreasury);

    error NotOperator();
    error NotAllowed();
    error InvalidTitle();
    error BadWindow();
    error UnknownBounty();
    error UnknownClip();
    error BountyClosed();
    error SubmissionsClosed();
    error VotingClosed();
    error VotingActive();
    error NoCharacter();
    error NotBard();
    error AlreadySubmitted();
    error TooManyClips();
    error InvalidUrl();
    error ClipIsHidden();
    error OwnClip();
    error AlreadyVoted();
    error NoWeight();
    error ProposalUsed();
    error NotAPayout();
    error WrongCreator();

    constructor(
        IERC20 token_,
        CreatorRegistry registry_,
        Character character_,
        SplitVault vault_,
        CommunityTreasury treasury_,
        uint8 decimals_
    ) {
        token = token_;
        registry = registry_;
        character = character_;
        vault = vault_;
        treasury = treasury_;
        _unit = 10 ** decimals_;
    }

    // ---- bounties ----

    /// @notice Posts a bounty. `reward` (may be 0, to be funded by the community) is pulled from the
    ///         caller and held here. Submissions run until `submitEnd`, voting until `voteEnd`.
    function createBounty(uint256 creatorId, string calldata title, uint256 reward, uint64 submitEnd, uint64 voteEnd)
        external
        nonReentrant
        returns (uint256 bountyId)
    {
        if (!registry.isOperator(creatorId, msg.sender)) revert NotOperator();
        uint256 len = bytes(title).length;
        if (len == 0 || len > MAX_TITLE_BYTES) revert InvalidTitle();
        if (
            submitEnd < block.timestamp + MIN_WINDOW || voteEnd < uint256(submitEnd) + MIN_WINDOW
                || voteEnd > block.timestamp + MAX_DURATION
        ) revert BadWindow();

        bountyId = ++bountyCount;
        Bounty storage b = _bounties[bountyId];
        b.creatorId = creatorId;
        b.title = title;
        b.submitEnd = submitEnd;
        b.voteEnd = voteEnd;
        if (reward > 0) {
            b.funder = msg.sender;
            b.escrow = reward;
            token.safeTransferFrom(msg.sender, address(this), reward);
        }
        emit BountyCreated(bountyId, creatorId, msg.sender, title, reward, submitEnd, voteEnd);
    }

    /// @notice Adds a passed treasury payout to a bounty's reward. The proposal must be an executed
    ///         Spend that paid this contract, for the same creator, and not used before. Only the
    ///         creator, a mod or the proposal's author may attach it, so nobody can steer the
    ///         community's money to a different bounty.
    function fundFromProposal(uint256 bountyId, uint256 proposalId) external {
        Bounty storage b = _bounties[bountyId];
        if (b.creatorId == 0) revert UnknownBounty();
        if (b.finalized) revert BountyClosed();
        CommunityTreasury.Proposal memory p = _payout(proposalId);
        if (p.creatorId != b.creatorId) revert WrongCreator();
        if (msg.sender != p.proposer && !registry.isOperator(b.creatorId, msg.sender)) revert NotAllowed();
        proposalUsed[proposalId] = true;
        b.communityFunds += p.amount;
        emit BountyFunded(bountyId, proposalId, p.amount);
    }

    /// @notice Sends a treasury payout that no bounty used back to the community treasury.
    function returnProposalFunds(uint256 proposalId) external nonReentrant {
        CommunityTreasury.Proposal memory p = _payout(proposalId);
        if (!registry.isOperator(p.creatorId, msg.sender)) revert NotOperator();
        proposalUsed[proposalId] = true;
        _toTreasury(p.creatorId, p.amount, "Unused clip bounty money");
        emit ProposalFundsReturned(proposalId, p.creatorId, p.amount);
    }

    // ---- clips ----

    /// @notice A Bard submits one clip per bounty, before submissions close. Only the link is kept
    ///         (in the event).
    function submitClip(uint256 bountyId, string calldata url) external returns (uint256 clipId) {
        Bounty storage b = _bounties[bountyId];
        if (b.creatorId == 0) revert UnknownBounty();
        if (block.timestamp >= b.submitEnd) revert SubmissionsClosed();
        // roleOf answers Knight for an address without a character, so check that first
        if (!character.hasCharacter(msg.sender)) revert NoCharacter();
        if (character.roleOf(msg.sender) != Character.Role.Bard) revert NotBard();
        if (registry.isOperator(b.creatorId, msg.sender)) revert NotAllowed();
        if (hasSubmitted[bountyId][msg.sender]) revert AlreadySubmitted();
        if (_clipsOf[bountyId].length >= MAX_CLIPS) revert TooManyClips();
        if (!_isHttps(url)) revert InvalidUrl();

        hasSubmitted[bountyId][msg.sender] = true;
        clipId = ++clipCount;
        _clips[clipId] = Clip({bountyId: bountyId, author: msg.sender, weight: 0, votes: 0, hidden: false});
        _clipsOf[bountyId].push(clipId);
        character.grantXP(msg.sender, SUBMIT_XP, XPKind.Clip);
        emit ClipSubmitted(clipId, bountyId, msg.sender, url);
    }

    /// @notice One vote per bounty, weighted by sqrt(XP), while voting is open. Not for your own clip,
    ///         and not for the creator or their mods.
    function vote(uint256 clipId) external {
        Clip storage c = _clips[clipId];
        if (c.author == address(0)) revert UnknownClip();
        Bounty storage b = _bounties[c.bountyId];
        if (block.timestamp < b.submitEnd || block.timestamp >= b.voteEnd) revert VotingClosed();
        if (c.hidden) revert ClipIsHidden();
        if (c.author == msg.sender) revert OwnClip();
        if (registry.isOperator(b.creatorId, msg.sender)) revert NotAllowed();
        if (votedClip[c.bountyId][msg.sender] != 0) revert AlreadyVoted();
        uint256 weight = character.votingWeight(msg.sender);
        if (weight == 0) revert NoWeight();

        votedClip[c.bountyId][msg.sender] = clipId;
        c.weight += weight;
        c.votes += 1;
        character.grantXP(msg.sender, VOTE_XP, XPKind.Governance);
        if (c.votes <= MAX_REWARDED_VOTES) character.grantXP(c.author, VOTE_RECEIVED_XP, XPKind.Clip);
        emit ClipVoted(clipId, c.bountyId, msg.sender, weight);
    }

    /// @notice The creator or a mod hides spam (or shows it again) until voting ends. A hidden clip
    ///         takes no votes and cannot win.
    function hide(uint256 clipId, bool hidden) external {
        Clip storage c = _clips[clipId];
        if (c.author == address(0)) revert UnknownClip();
        Bounty storage b = _bounties[c.bountyId];
        if (!registry.isOperator(b.creatorId, msg.sender)) revert NotOperator();
        if (b.finalized || block.timestamp >= b.voteEnd) revert BountyClosed();
        c.hidden = hidden;
        emit ClipHidden(clipId, c.bountyId, hidden);
    }

    /// @notice After voting ends anyone can settle a bounty. The visible clip with the most weight wins
    ///         (a tie goes to the clip submitted first) and takes the whole reward. With no votes at
    ///         all, the creator's part goes back to them and the community's part to the treasury.
    function finalize(uint256 bountyId) external nonReentrant {
        Bounty storage b = _bounties[bountyId];
        if (b.creatorId == 0) revert UnknownBounty();
        if (b.finalized) revert BountyClosed();
        if (block.timestamp < b.voteEnd) revert VotingActive();
        b.finalized = true;

        uint256 best;
        uint256 bestWeight;
        uint256[] storage ids = _clipsOf[bountyId];
        for (uint256 i; i < ids.length; ++i) {
            Clip storage c = _clips[ids[i]];
            if (!c.hidden && c.weight > bestWeight) {
                best = ids[i];
                bestWeight = c.weight;
            }
        }

        uint256 escrow = b.escrow;
        uint256 community = b.communityFunds;
        if (best != 0) {
            b.winningClip = best;
            address author = _clips[best].author;
            uint256 amount = escrow + community;
            if (amount > 0) token.safeTransfer(author, amount);
            if (amount >= _unit) character.grantXP(author, WIN_XP, XPKind.Clip);
            emit BountyWon(bountyId, best, author, amount);
        } else {
            if (escrow > 0) token.safeTransfer(b.funder, escrow);
            if (community > 0) _toTreasury(b.creatorId, community, "Clip bounty without a winner");
            emit BountyRefunded(bountyId, escrow, community);
        }
    }

    // ---- views ----

    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return _bounties[bountyId];
    }

    function getClip(uint256 clipId) external view returns (Clip memory) {
        return _clips[clipId];
    }

    function clipsOf(uint256 bountyId) external view returns (uint256[] memory) {
        return _clipsOf[bountyId];
    }

    // ---- internals ----

    /// @dev the executed Spend proposal `proposalId` that paid this contract, if nothing used it yet
    function _payout(uint256 proposalId) internal view returns (CommunityTreasury.Proposal memory p) {
        if (proposalUsed[proposalId]) revert ProposalUsed();
        p = treasury.getProposal(proposalId);
        if (
            p.kind != CommunityTreasury.Kind.Spend || p.status != CommunityTreasury.Status.Executed
                || p.recipient != address(this)
        ) revert NotAPayout();
    }

    function _toTreasury(uint256 creatorId, uint256 amount, string memory reason) internal {
        token.forceApprove(address(vault), amount);
        vault.fundTreasury(creatorId, amount, reason);
    }

    function _isHttps(string calldata url) internal pure returns (bool) {
        bytes calldata u = bytes(url);
        if (u.length <= 8 || u.length > MAX_URL_BYTES) return false;
        return bytes8(u[:8]) == bytes8("https://");
    }
}
