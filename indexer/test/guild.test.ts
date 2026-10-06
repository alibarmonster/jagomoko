import { describe, it } from "vitest";
import { createTestIndexer, TestHelpers, type Address } from "envio";

const [streamer, alice, bob, streamer2] = TestHelpers.Addresses.mockAddresses;
const CHAIN = 31337;
const USD = 1_000_000n;
const T0 = 1_700_000_000;
// simulated events in one block share a transaction, so a block here stands for one transaction
const block = (n: number) => ({ number: n, timestamp: T0 + n });

// Addresses from config.local.yaml
const QUEST_ESCROW: Address = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";

const KIND = { Back: 0n, Predict: 1n, Jury: 2n, Clip: 3n, Tip: 4n, Governance: 5n };

const setup = [
  {
    contract: "CreatorRegistry",
    event: "CreatorRegistered",
    block: block(1),
    params: { creatorId: 1n, owner: streamer, handle: "neon", creatorBps: 9_800n, treasuryBps: 100n, communityBps: 100n },
  },
  {
    contract: "CreatorRegistry",
    event: "CreatorRegistered",
    block: block(1),
    params: { creatorId: 2n, owner: streamer2, handle: "blade", creatorBps: 9_800n, treasuryBps: 100n, communityBps: 100n },
  },
  { contract: "Character", event: "CharacterMinted", block: block(2), params: { player: alice, tokenId: 1n, role: 0n, name: "Knight-a1b2" } },
  { contract: "Character", event: "CharacterMinted", block: block(2), params: { player: bob, tokenId: 2n, role: 1n, name: "Seer-b2c3" } },
  // the first creator also has a character of their own
  { contract: "Character", event: "CharacterMinted", block: block(2), params: { player: streamer, tokenId: 3n, role: 3n, name: "Bard-c3d4" } },
] as const;

function xpChanged(player: Address, delta: bigint, newXp: bigint, kind: bigint, b: number) {
  return { contract: "Character", event: "XPChanged", block: block(b), params: { player, tokenId: 1n, newXp, delta, kind } } as const;
}

function deposited(creatorId: bigint, from: Address, amount: bigint, memo: string, b: number) {
  const cut = amount / 100n;
  return {
    contract: "SplitVault",
    event: "Deposited",
    block: block(b),
    params: { creatorId, from, amount, creatorCut: amount - 2n * cut, treasuryCut: cut, communityCut: cut, memo },
  } as const;
}

describe("guild membership", () => {
  it("credits each action to its own guild, even inside one transaction", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            { contract: "QuestEscrow", event: "QuestCreated", block: block(3), params: { questId: 1n, creatorId: 2n, title: "Speedrun", goalDeadline: BigInt(T0 + 3600) } },
            // one sponsored operation: a $5 tip to the first guild and $10 on a quest of the second
            xpChanged(alice, 50n, 50n, KIND.Tip, 4),
            deposited(1n, alice, 5n * USD, "gg", 4),
            xpChanged(alice, 150n, 200n, KIND.Back, 4),
            { contract: "QuestEscrow", event: "QuestBacked", block: block(4), params: { questId: 1n, backer: alice, amount: 10n * USD, newPool: 10n * USD } },
          ],
        },
      },
    });

    t.expect(await indexer.Member.getOrThrow(`1-${alice}`)).toMatchObject({ guildXp: 50n, totalTipped: 5n * USD, totalBacked: 0n, actions: 1 });
    t.expect(await indexer.Member.getOrThrow(`2-${alice}`)).toMatchObject({ guildXp: 150n, totalTipped: 0n, totalBacked: 10n * USD, actions: 1 });
    t.expect(await indexer.Creator.getOrThrow("1")).toMatchObject({ memberCount: 1, jago_id: `1-${alice}`, jagoXp: 50n });
    t.expect(await indexer.Creator.getOrThrow("2")).toMatchObject({ memberCount: 1, jago_id: `2-${alice}`, jagoXp: 150n });
    t.expect(await indexer.PendingXP.getAll()).toEqual([]);
  });

  it("never makes an anonymous tipper a member, and drops the tip's XP", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [...setup, xpChanged(bob, 50n, 50n, KIND.Tip, 3), deposited(1n, bob, 5n * USD, "[anon] hi", 3)],
        },
      },
    });

    t.expect(await indexer.Member.get(`1-${bob}`)).toBeUndefined();
    t.expect((await indexer.Creator.getOrThrow("1")).memberCount).toBe(0);
    t.expect(await indexer.PendingXP.getAll()).toEqual([]);
    // the tipper keeps their XP and history, the guild just never learns who it was
    t.expect((await indexer.Player.getOrThrow(bob)).xp).toBe(50n);
  });

  it("does not count escrow deposits or the guild's own creator", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            deposited(1n, QUEST_ESCROW, 40n * USD, "Quest complete: Speedrun", 3),
            xpChanged(streamer, 100n, 100n, KIND.Tip, 4),
            deposited(1n, streamer, 10n * USD, "testing my own alert", 4),
          ],
        },
      },
    });

    t.expect(await indexer.Member.getAll()).toEqual([]);
    t.expect((await indexer.Creator.getOrThrow("1")).memberCount).toBe(0);
    t.expect(await indexer.PendingXP.getAll()).toEqual([]);
  });

  it("hands the Jago crown over only when someone passes the holder", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            xpChanged(alice, 100n, 100n, KIND.Tip, 3),
            deposited(1n, alice, 10n * USD, "", 3),
            // bob ties: the crown stays with alice, who got there first
            xpChanged(bob, 100n, 100n, KIND.Tip, 4),
            deposited(1n, bob, 10n * USD, "", 4),
          ],
        },
      },
    });
    t.expect(await indexer.Creator.getOrThrow("1")).toMatchObject({ memberCount: 2, jago_id: `1-${alice}`, jagoXp: 100n });

    await indexer.process({
      chains: { [CHAIN]: { simulate: [xpChanged(bob, 50n, 150n, KIND.Tip, 5), deposited(1n, bob, 5n * USD, "", 5)] } },
    });
    t.expect(await indexer.Creator.getOrThrow("1")).toMatchObject({ memberCount: 2, jago_id: `1-${bob}`, jagoXp: 150n });
    t.expect(await indexer.Member.getOrThrow(`1-${bob}`)).toMatchObject({ guildXp: 150n, totalTipped: 15n * USD, actions: 2 });
  });

  it("keeps jury XP out of every guild", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            {
              contract: "Jury",
              event: "CaseOpened",
              block: block(3),
              params: { caseId: 1n, client: QUEST_ESCROW, marketId: 1n, creatorId: 1n, jurors: [bob], deadline: BigInt(T0 + 1800) },
            },
            { contract: "Jury", event: "JuryVoted", block: block(4), params: { caseId: 1n, juror: bob, verdict: 1n } },
            xpChanged(bob, 45n, 45n, KIND.Jury, 5),
            { contract: "Jury", event: "JurorRewarded", block: block(5), params: { caseId: 1n, juror: bob, fee: 500_000n } },
          ],
        },
      },
    });

    t.expect(await indexer.Member.getAll()).toEqual([]);
    t.expect(await indexer.PendingXP.getAll()).toEqual([]);
    t.expect((await indexer.Player.getOrThrow(bob)).xp).toBe(45n);
  });

  it("counts claims as XP for the guild but not as new actions", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            {
              contract: "PredictionBattle",
              event: "BattleCreated",
              block: block(3),
              params: { battleId: 1n, creatorId: 1n, question: "Win?", sideA: "Win", sideB: "Lose", closeTime: BigInt(T0 + 300), pointsMode: false },
            },
            xpChanged(bob, 15n, 15n, KIND.Predict, 4),
            { contract: "PredictionBattle", event: "BattleJoined", block: block(4), params: { battleId: 1n, player: bob, side: 0n, amount: 5n * USD, poolA: 5n * USD, poolB: 0n } },
            { contract: "PredictionBattle", event: "MarketResolved", block: block(5), params: { marketId: 1n, verdict: 1n } },
            { contract: "PredictionBattle", event: "BattleSettled", block: block(5), params: { battleId: 1n, verdict: 1n, refundAll: false, toTreasury: 0n, winnings: 0n } },
            xpChanged(bob, 75n, 90n, KIND.Predict, 6),
            { contract: "PredictionBattle", event: "BattleClaimed", block: block(6), params: { battleId: 1n, player: bob, payout: 5n * USD, xp: 75n } },
          ],
        },
      },
    });

    t.expect(await indexer.Member.getOrThrow(`1-${bob}`)).toMatchObject({ guildXp: 90n, totalPicked: 5n * USD, actions: 1 });
  });
});

describe("feed sentences", () => {
  it("never carry a player's name (it is only a stand-in on chain)", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            { contract: "QuestEscrow", event: "QuestCreated", block: block(3), params: { questId: 1n, creatorId: 1n, title: "Speedrun", goalDeadline: BigInt(T0 + 3600) } },
            { contract: "QuestEscrow", event: "QuestBacked", block: block(4), params: { questId: 1n, backer: alice, amount: USD, newPool: USD } },
            {
              contract: "PredictionBattle",
              event: "BattleCreated",
              block: block(4),
              params: { battleId: 1n, creatorId: 1n, question: "Win?", sideA: "Win", sideB: "Lose", closeTime: BigInt(T0 + 300), pointsMode: true },
            },
            { contract: "PredictionBattle", event: "BattleJoined", block: block(5), params: { battleId: 1n, player: bob, side: 0n, amount: 0n, poolA: 0n, poolB: 0n } },
          ],
        },
      },
    });

    const feed = await indexer.Activity.getAll();
    const text = (kind: string) => feed.filter((a) => a.kind === kind).map((a) => a.text);
    t.expect(text("CharacterMinted").sort()).toEqual(["joined as a Bard", "joined as a Knight", "joined as a Seer"]);
    t.expect(text("QuestBacked")).toEqual(['backed "Speedrun"']);
    t.expect(text("BattleJoined")).toEqual(["picked Win"]);
    t.expect(text("CreatorJoined").sort()).toEqual(["blade founded their guild", "neon founded their guild"]);
    t.expect(feed.some((a) => /Knight-|Seer-|Bard-/.test(a.text))).toBe(false);
  });
});
