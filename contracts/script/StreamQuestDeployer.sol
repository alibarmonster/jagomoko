// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {MockYieldVault} from "../src/MockYieldVault.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {Character} from "../src/Character.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {Jury} from "../src/Jury.sol";
import {QuestEscrow} from "../src/QuestEscrow.sol";
import {PredictionBattle} from "../src/PredictionBattle.sol";
import {CommunityTreasury} from "../src/CommunityTreasury.sol";
import {ClipBoard} from "../src/ClipBoard.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {MockMON} from "../src/MockMON.sol";
import {MokoSwap} from "../src/MokoSwap.sol";
import {MockLST} from "../src/MockLST.sol";
import {LstStrategy} from "../src/LstStrategy.sol";
import {CommunityPoolVault} from "../src/CommunityPoolVault.sol";
import {TipReceiver} from "../src/TipReceiver.sol";

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
        uint256 strategyAprBps;
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
        MockYieldVault strategy;
        ClipBoard clips;
    }

    /// @dev v2: the Community Pool (treasury yield) and its testnet stand-ins
    struct PoolConfig {
        uint256 monPrice; // USD per MON, 8 decimals
        uint256 swapFeeBps;
        uint256 lstAprBps;
        uint256 instantFeeBps;
        uint64 unbonding;
        uint16 lstBps; // share of the pool in liquid staking
        uint256 seedUsd; // MokoSwap inventory
        uint256 seedMon;
    }

    struct Pool {
        MockMON mon;
        MokoSwap swap;
        MockLST lst;
        LstStrategy lstLeg;
        CommunityPoolVault pool;
    }

    function defaultPoolConfig() internal pure returns (PoolConfig memory) {
        return PoolConfig({
            monPrice: 5_000_000, // $0.05
            swapFeeBps: 10,
            lstAprBps: 1_000, // 10% simulated staking yield
            instantFeeBps: 20,
            unbonding: 10 minutes,
            lstBps: 3_000,
            seedUsd: 100_000e6,
            seedMon: 2_000_000e18 // $100k at $0.05
        });
    }

    function defaultConfig() internal pure returns (Config memory) {
        return Config({
            juryMinLevel: 5,
            jurorsPerCase: 3,
            juryVoteWindow: 30 minutes,
            jurorFee: 0.5e6,
            challengeWindow: 10 minutes,
            votingPeriod: 1 days,
            quorum: 10,
            strategyAprBps: 800 // 8% simulated yield for the testnet strategy
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

        // testnet yield strategy: the treasury can park funds here once the community votes for it
        s.strategy = new MockYieldVault(s.usd, cfg.strategyAprBps);
        s.usd.setMinter(address(s.strategy), true);
        s.vault.setStrategy(s.strategy);

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

        // added after the rest, so every earlier contract keeps its address
        s.clips = new ClipBoard(IERC20(address(s.usd)), s.registry, s.character, s.vault, s.treasury, 6);
        s.character.grantRole(xpGranter, address(s.clips));
    }

    /// @notice Builds the Community Pool on an existing system and makes it the SplitVault's
    ///         strategy: token staking = `stable` (the MockYieldVault), liquid staking = a mock
    ///         LST bought through MokoSwap. Added after everything else, so earlier addresses stay.
    /// @dev The caller must own MockUSD (it seeds the swap) and be the SplitVault admin, and no
    ///      treasury may be invested yet (setStrategy refuses otherwise).
    function _deployPool(MockUSD usd, IERC4626 stable, SplitVault vault, address admin, PoolConfig memory pc)
        internal
        returns (Pool memory p)
    {
        p.mon = new MockMON();
        p.swap = new MokoSwap(IERC20(address(usd)), IERC20(address(p.mon)), pc.monPrice, pc.swapFeeBps);
        p.lst = new MockLST(p.mon, pc.lstAprBps, pc.instantFeeBps, pc.unbonding);
        p.lstLeg = new LstStrategy(IERC20(address(usd)), p.swap, p.lst);
        p.pool = new CommunityPoolVault(IERC20(address(usd)), stable, p.lstLeg, address(vault), pc.lstBps, admin);
        p.lstLeg.bind(address(p.pool));

        p.mon.setMinter(address(p.lst), true); // staking rewards
        usd.mint(address(p.swap), pc.seedUsd);
        p.mon.mint(address(p.swap), pc.seedMon);

        vault.setStrategy(p.pool);
    }

    /// @notice The Monad end of cross-chain tips. It mints practice dollars, so it needs the
    ///         MockUSD minter role, and credits donors, so it needs DEPOSIT_RELAYER.
    /// @dev The caller must own MockUSD and be the SplitVault admin. Peers are set separately,
    ///      once the sender on the other chain exists.
    function _deployTipReceiver(address endpoint, MockUSD usd, SplitVault vault, address owner)
        internal
        returns (TipReceiver r)
    {
        r = new TipReceiver(endpoint, usd, vault, owner);
        usd.setMinter(address(r), true);
        vault.grantRole(vault.DEPOSIT_RELAYER(), address(r));
    }
}
