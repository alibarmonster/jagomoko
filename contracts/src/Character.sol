// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {XPKind} from "./Types.sol";

/// @notice Soulbound viewer character. One per address. XP can only be earned
///         through game actions (granted by the game contracts), never bought.
contract Character is ERC721, AccessControl {
    bytes32 public constant XP_GRANTER = keccak256("XP_GRANTER");

    enum Role {
        Knight, // backs quests
        Seer, // predicts battles
        Judge, // resolves disputes
        Bard // clips
    }

    struct Profile {
        Role role;
        string name;
        uint256 xp;
    }

    /// @dev specialty bonus: +50% XP when the kind matches the role
    uint256 public constant SPECIALTY_BONUS_BPS = 15_000;
    /// @dev level L requires XP_PER_LEVEL_UNIT * (L-1)^2 xp
    uint256 public constant XP_PER_LEVEL_UNIT = 100;

    uint256 public nextId = 1;
    mapping(uint256 => Profile) internal _profiles;
    mapping(address => uint256) public characterOf;

    event CharacterMinted(address indexed player, uint256 indexed tokenId, Role role, string name);
    event XPChanged(address indexed player, uint256 indexed tokenId, uint256 newXp, int256 delta, XPKind kind);

    error AlreadyHasCharacter();
    error Soulbound();
    error InvalidName();

    constructor(address admin) ERC721("StreamQuest Character", "SQC") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mint(Role role, string calldata name) external returns (uint256 tokenId) {
        if (characterOf[msg.sender] != 0) revert AlreadyHasCharacter();
        uint256 len = bytes(name).length;
        if (len == 0 || len > 24) revert InvalidName();
        tokenId = nextId++;
        characterOf[msg.sender] = tokenId;
        _profiles[tokenId] = Profile({role: role, name: name, xp: 0});
        _mint(msg.sender, tokenId);
        emit CharacterMinted(msg.sender, tokenId, role, name);
    }

    /// @notice Grants XP. Silently no-ops for addresses without a character so
    ///         game actions never revert because of missing characters.
    function grantXP(address player, uint256 amount, XPKind kind) external onlyRole(XP_GRANTER) returns (uint256 granted) {
        uint256 id = characterOf[player];
        if (id == 0 || amount == 0) return 0;
        Profile storage p = _profiles[id];
        granted = _isSpecialty(p.role, kind) ? (amount * SPECIALTY_BONUS_BPS) / 10_000 : amount;
        p.xp += granted;
        emit XPChanged(player, id, p.xp, int256(granted), kind);
    }

    function slashXP(address player, uint256 amount, XPKind kind) external onlyRole(XP_GRANTER) {
        uint256 id = characterOf[player];
        if (id == 0 || amount == 0) return;
        Profile storage p = _profiles[id];
        uint256 cut = amount > p.xp ? p.xp : amount;
        p.xp -= cut;
        emit XPChanged(player, id, p.xp, -int256(cut), kind);
    }

    // ---- views ----

    function profileOf(address player) external view returns (Profile memory) {
        return _profiles[characterOf[player]];
    }

    function xpOf(address player) public view returns (uint256) {
        return _profiles[characterOf[player]].xp;
    }

    function roleOf(address player) external view returns (Role) {
        return _profiles[characterOf[player]].role;
    }

    function hasCharacter(address player) external view returns (bool) {
        return characterOf[player] != 0;
    }

    function levelOf(address player) external view returns (uint256) {
        return levelForXP(xpOf(player));
    }

    function levelForXP(uint256 xp) public pure returns (uint256) {
        return Math.sqrt(xp / XP_PER_LEVEL_UNIT) + 1;
    }

    /// @notice sqrt(xp) voting weight — dampens whales
    function votingWeight(address player) external view returns (uint256) {
        return Math.sqrt(xpOf(player));
    }

    // ---- soulbound ----

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _isSpecialty(Role role, XPKind kind) internal pure returns (bool) {
        return (role == Role.Knight && kind == XPKind.Back) || (role == Role.Seer && kind == XPKind.Predict)
            || (role == Role.Judge && kind == XPKind.Jury) || (role == Role.Bard && kind == XPKind.Clip);
    }
}
