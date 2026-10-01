// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {Character} from "../src/Character.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {Jury} from "../src/Jury.sol";
import {QuestEscrow} from "../src/QuestEscrow.sol";
import {PredictionBattle} from "../src/PredictionBattle.sol";
import {CommunityTreasury} from "../src/CommunityTreasury.sol";

/// @notice Deploys and wires the whole system. Shared by tests and Deploy.s.sol.
abstract contract StreamQuestDeployer {
    struct Config {
        uint256 juryMinLevel;
        uint256 jurorsPerCase;
        uint64 juryVoteWindow;
        uint256 jurorFee;
        uint64 challengeWindow;
        uint64 votingPeriod;
        uint256 quorum;
    }

    struct System {
        MockUSD usd;
        CreatorRegistry registry;
        Character character;
        SplitVault vault;
        Jury jury;
        QuestEscrow quests;
        PredictionBattle battles;
        CommunityTreasury treasury;
    }

    function defaultConfig() internal pure returns (Config memory) {
        return Config({
            juryMinLevel: 5,
            jurorsPerCase: 3,
            juryVoteWindow: 30 minutes,
            jurorFee: 0.5e6,
            challengeWindow: 10 minutes,
            votingPeriod: 1 days,
            quorum: 10
        });
    }

    /// @param admin receives DEFAULT_ADMIN_ROLE everywhere; must be the caller
    ///        (roles are wired in this function)
    function _deploy(address admin, Config memory cfg) internal returns (System memory s) {
        s.usd = new MockUSD();
        s.registry = new CreatorRegistry();
        s.character = new Character(admin);
        s.vault = new SplitVault(IERC20(address(s.usd)), s.registry, s.character, 6, admin);
        s.jury = new Jury(s.character, s.vault, admin, cfg.juryMinLevel, cfg.jurorsPerCase, cfg.juryVoteWindow, cfg.jurorFee);
        s.quests = new QuestEscrow(IERC20(address(s.usd)), s.registry, s.character, s.vault, s.jury, cfg.challengeWindow, 6);
        s.battles = new PredictionBattle(IERC20(address(s.usd)), s.registry, s.character, s.vault, s.jury, cfg.challengeWindow, 6);
        s.treasury = new CommunityTreasury(s.registry, s.character, s.vault, cfg.votingPeriod, cfg.quorum);

        bytes32 xpGranter = s.character.XP_GRANTER();
        s.character.grantRole(xpGranter, address(s.vault));
        s.character.grantRole(xpGranter, address(s.jury));
        s.character.grantRole(xpGranter, address(s.quests));
        s.character.grantRole(xpGranter, address(s.battles));
        s.character.grantRole(xpGranter, address(s.treasury));

        s.vault.grantRole(s.vault.TREASURY_SPENDER(), address(s.treasury));
        s.vault.grantRole(s.vault.COMMUNITY_SPENDER(), address(s.jury));

        s.jury.grantRole(s.jury.CLIENT_ROLE(), address(s.quests));
        s.jury.grantRole(s.jury.CLIENT_ROLE(), address(s.battles));
    }
}
