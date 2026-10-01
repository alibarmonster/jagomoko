// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Creators register a handle and a revenue split. Splits always
///         reserve a community share and changes are timelocked so supporters
///         can't be rugged mid-stream.
contract CreatorRegistry {
    uint16 public constant BPS = 10_000;
    uint16 public constant MIN_COMMUNITY_BPS = 1_000; // treasury + community >= 10%
    uint64 public constant SPLIT_DELAY = 1 days;

    struct Split {
        uint16 creatorBps;
        uint16 treasuryBps;
        uint16 communityBps; // reward pool: jury fees, clip bounties
    }

    struct Creator {
        address owner;
        string handle;
        Split split;
        Split pendingSplit;
        uint64 pendingAt; // 0 = none
    }

    uint256 public creatorCount;
    mapping(uint256 => Creator) internal _creators;
    mapping(bytes32 => uint256) public idOfHandle;
    mapping(address => uint256) public idOfOwner;
    mapping(uint256 => mapping(address => bool)) public isModerator;

    event CreatorRegistered(uint256 indexed creatorId, address indexed owner, string handle, uint16 creatorBps, uint16 treasuryBps, uint16 communityBps);
    event SplitChangeQueued(uint256 indexed creatorId, uint16 creatorBps, uint16 treasuryBps, uint16 communityBps, uint64 effectiveAt);
    event SplitChanged(uint256 indexed creatorId, uint16 creatorBps, uint16 treasuryBps, uint16 communityBps);
    event ModeratorSet(uint256 indexed creatorId, address indexed moderator, bool enabled);

    error InvalidSplit();
    error HandleTaken();
    error InvalidHandle();
    error AlreadyRegistered();
    error NotCreator();
    error NoPendingSplit();
    error TooEarly();
    error UnknownCreator();

    modifier onlyCreator(uint256 creatorId) {
        if (_creators[creatorId].owner != msg.sender) revert NotCreator();
        _;
    }

    function register(string calldata handle, Split calldata split) external returns (uint256 creatorId) {
        bytes memory h = bytes(handle);
        if (h.length < 2 || h.length > 32) revert InvalidHandle();
        bytes32 key = keccak256(h);
        if (idOfHandle[key] != 0) revert HandleTaken();
        if (idOfOwner[msg.sender] != 0) revert AlreadyRegistered();
        _validate(split);

        creatorId = ++creatorCount;
        Creator storage c = _creators[creatorId];
        c.owner = msg.sender;
        c.handle = handle;
        c.split = split;
        idOfHandle[key] = creatorId;
        idOfOwner[msg.sender] = creatorId;

        emit CreatorRegistered(creatorId, msg.sender, handle, split.creatorBps, split.treasuryBps, split.communityBps);
    }

    function queueSplit(uint256 creatorId, Split calldata split) external onlyCreator(creatorId) {
        _validate(split);
        Creator storage c = _creators[creatorId];
        c.pendingSplit = split;
        c.pendingAt = uint64(block.timestamp) + SPLIT_DELAY;
        emit SplitChangeQueued(creatorId, split.creatorBps, split.treasuryBps, split.communityBps, c.pendingAt);
    }

    function applySplit(uint256 creatorId) external {
        Creator storage c = _creators[creatorId];
        if (c.pendingAt == 0) revert NoPendingSplit();
        if (block.timestamp < c.pendingAt) revert TooEarly();
        c.split = c.pendingSplit;
        c.pendingAt = 0;
        emit SplitChanged(creatorId, c.split.creatorBps, c.split.treasuryBps, c.split.communityBps);
    }

    function setModerator(uint256 creatorId, address moderator, bool enabled) external onlyCreator(creatorId) {
        isModerator[creatorId][moderator] = enabled;
        emit ModeratorSet(creatorId, moderator, enabled);
    }

    // ---- views ----

    function ownerOf(uint256 creatorId) public view returns (address owner) {
        owner = _creators[creatorId].owner;
        if (owner == address(0)) revert UnknownCreator();
    }

    function splitOf(uint256 creatorId) external view returns (Split memory) {
        if (_creators[creatorId].owner == address(0)) revert UnknownCreator();
        return _creators[creatorId].split;
    }

    function handleOf(uint256 creatorId) external view returns (string memory) {
        return _creators[creatorId].handle;
    }

    function pendingSplitOf(uint256 creatorId) external view returns (Split memory split, uint64 effectiveAt) {
        return (_creators[creatorId].pendingSplit, _creators[creatorId].pendingAt);
    }

    /// @notice creator or one of their moderators
    function isOperator(uint256 creatorId, address account) public view returns (bool) {
        return account == ownerOf(creatorId) || isModerator[creatorId][account];
    }

    function _validate(Split calldata s) internal pure {
        if (uint256(s.creatorBps) + s.treasuryBps + s.communityBps != BPS) revert InvalidSplit();
        if (uint256(s.treasuryBps) + s.communityBps < MIN_COMMUNITY_BPS) revert InvalidSplit();
    }
}
