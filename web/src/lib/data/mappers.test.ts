import { describe, expect, it } from "vitest";
import {
  big,
  mapActivity,
  mapBattle,
  mapCreator,
  mapJuryCase,
  mapPlayer,
  mapProposal,
  mapProtocol,
  mapQuest,
  ms,
  type BattleRow,
  type CreatorRow,
  type PlayerRow,
  type QuestRow,
} from "./mappers";

const USD = 1_000_000n;

const creatorRow: CreatorRow = {
  id: "1",
  owner: "0x5F4ef1E644659cE869e8273C57a01b3eef941c0b",
  handle: "karambol",
  handleKey: "karambol",
  creatorBps: 9800,
  treasuryBps: 100,
  communityBps: 100,
  pendingCreatorBps: null,
  pendingTreasuryBps: null,
  pendingCommunityBps: null,
  pendingEffectiveAt: null,
  creatorBalance: "9800000",
  treasuryBalance: "100000",
  treasuryInvestedCost: "50000",
  communityBalance: "100000",
  totalReceived: "10000000",
  tipCount: 1,
  createdAt: "1791112226",
  moderators: [{ account: "0xabc" }],
};

const playerRow: PlayerRow = {
  id: "0xe2423bDEe474D88F0ec7fA827cF1a39E0FE70864",
  name: "Karambol",
  role: "Judge",
  xp: "120",
  level: 2,
  totalTipped: "0",
  totalBacked: "5000000",
  totalWon: "0",
  battlesWon: 0,
  juryVotes: 0,
  enlisted: true,
  createdAt: "1791112226",
};

const questRow: QuestRow = {
  id: "3",
  creator_id: "1",
  title: "Beat the Ender Dragon",
  goalDeadline: "1791115826",
  pool: "340000000",
  backers: 12,
  status: "Proposed",
  proposedVerdict: "Yes",
  proposer: "0xabc",
  proofUrl: "https://youtu.be/x",
  challengeDeadline: "1791113000",
  disputer: null,
  juryCase_id: null,
  toCreatorVault: "0",
  toTreasury: "0",
  refundable: "0",
  createdAt: "1791112300",
  resolvedAt: null,
  creator: { handle: "karambol" },
};

const battleRow: BattleRow = {
  id: "2",
  creator_id: "1",
  question: "Win this ranked match?",
  sideA: "Win",
  sideB: "Lose",
  closeTime: "1791113000",
  pointsMode: false,
  poolA: "182000000",
  poolB: "96000000",
  playersA: 14,
  playersB: 8,
  status: "Proposed",
  proposedVerdict: "No",
  proposer: "0xabc",
  proofUrl: null,
  challengeDeadline: "1791114000",
  juryCase_id: "1",
  refundAll: false,
  toTreasury: "0",
  winnings: "0",
  createdAt: "1791112400",
  resolvedAt: null,
  creator: { handle: "karambol" },
};

describe("units", () => {
  it("reads BigInt from strings and numbers, and treats missing as zero", () => {
    expect(big("340000000")).toBe(340n * USD);
    expect(big(5)).toBe(5n);
    expect(big(null)).toBe(0n);
    expect(big(undefined)).toBe(0n);
  });

  it("turns seconds into milliseconds", () => {
    expect(ms("1791112226")).toBe(1_791_112_226_000);
    expect(ms(0)).toBe(0);
  });
});

describe("mapCreator", () => {
  it("maps balances to bigint and time to milliseconds", () => {
    const c = mapCreator(creatorRow);
    expect(c).toMatchObject({ id: "1", handle: "karambol", handleKey: "karambol", creatorBps: 9800, tipCount: 1, createdAt: 1_791_112_226_000 });
    expect(c.creatorBalance).toBe(9_800_000n);
    expect(c.totalReceived).toBe(10n * USD);
    expect(c.moderators).toEqual(["0xabc"]);
  });

  it("counts money put to work at cost in the treasury total", () => {
    expect(mapCreator(creatorRow).treasuryBalance).toBe(150_000n);
  });

  it("has no pending split unless a whole one is queued", () => {
    expect(mapCreator(creatorRow).pendingSplit).toBeUndefined();
    const queued = mapCreator({ ...creatorRow, pendingCreatorBps: 9000, pendingTreasuryBps: 500, pendingCommunityBps: 500, pendingEffectiveAt: "1791200000" });
    expect(queued.pendingSplit).toEqual({ split: { creatorBps: 9000, treasuryBps: 500, communityBps: 500 }, effectiveAt: 1_791_200_000_000 });
    const partial = mapCreator({ ...creatorRow, pendingCreatorBps: 9000 });
    expect(partial.pendingSplit).toBeUndefined();
  });
});

describe("mapPlayer / mapQuest / mapBattle", () => {
  it("maps a player", () => {
    expect(mapPlayer(playerRow)).toMatchObject({ name: "Karambol", role: "Judge", level: 2, xp: 120n, totalBacked: 5n * USD, enlisted: true });
  });

  it("maps a quest and turns nulls into undefined", () => {
    const q = mapQuest(questRow);
    expect(q).toMatchObject({ id: "3", creatorId: "1", status: "Proposed", pool: 340n * USD, backers: 12, proposedVerdict: "Yes" });
    expect(q.goalDeadline).toBe(1_791_115_826_000);
    expect(q.challengeDeadline).toBe(1_791_113_000_000);
    expect(q.disputer).toBeUndefined();
    expect(q.juryCaseId).toBeUndefined();
    expect(q.resolvedAt).toBeUndefined();
  });

  it("maps a battle", () => {
    const b = mapBattle(battleRow);
    expect(b).toMatchObject({ id: "2", sideA: "Win", sideB: "Lose", poolA: 182n * USD, poolB: 96n * USD, playersA: 14, juryCaseId: "1" });
    expect(b.proofUrl).toBeUndefined();
  });
});

describe("mapProposal", () => {
  const row = {
    id: "1",
    creator_id: "1",
    proposer: "0xp",
    recipient: "0xr",
    amount: "20000000",
    description: "Clip bounty",
    endsAt: "1791200000",
    forWeight: "40",
    againstWeight: "0",
    voters: 1,
    status: "Active" as const,
    createdAt: "1791112226",
  };

  it("defaults to a spend and names the recipient from the player list", () => {
    const p = mapProposal(row, new Map([["0xr", "Alice"]]));
    expect(p).toMatchObject({ kind: "Spend", recipientName: "Alice", amount: 20n * USD, forWeight: 40n, status: "Active" });
  });

  it("keeps an allocation as basis points, not dollars", () => {
    const p = mapProposal({ ...row, kind: "Allocate", recipient: "0x0000000000000000000000000000000000000000", amount: "2500" }, new Map());
    expect(p).toMatchObject({ kind: "Allocate", amount: 2500n });
    expect(p.recipientName).toBeUndefined();
  });
});

describe("mapActivity", () => {
  it("attaches the actor name, role and level from the player list", () => {
    const players = new Map([[playerRow.id, mapPlayer(playerRow)]]);
    const a = mapActivity({ id: "5-1", creator_id: "1", actor: playerRow.id, kind: "Tip", amount: "5000000", refId: "9", text: "gg", timestamp: "1791112500" }, players);
    expect(a).toMatchObject({ creatorId: "1", actorName: "Karambol", actorRole: "Judge", actorLevel: 2, amount: 5n * USD, timestamp: 1_791_112_500_000 });
  });

  it("never names the tipper of an anonymous tip, even if the actor is a known player", () => {
    const players = new Map([[playerRow.id, mapPlayer(playerRow)]]);
    const a = mapActivity({ id: "5-4", creator_id: "1", actor: playerRow.id, kind: "Tip", amount: "5000000", refId: "9", text: "gg", anonymous: true, timestamp: "1" }, players);
    expect(a).toMatchObject({ actorName: "Anonymous", actor: "", anonymous: true });
    expect(a.actorRole).toBeUndefined();
    expect(a.actorLevel).toBeUndefined();
  });

  it("leaves ordinary tips and rows from before the flag existed as they were", () => {
    const a = mapActivity({ id: "5-5", creator_id: "1", actor: "0x1", kind: "Tip", amount: "1", refId: "9", text: "", anonymous: false, timestamp: "1" }, new Map());
    expect(a.anonymous).toBeUndefined();
    expect(a.actor).toBe("0x1");
    expect(mapActivity({ id: "5-6", actor: "0x1", kind: "Tip", amount: "1", refId: "9", text: "", timestamp: "1" }, new Map()).actorName).toBeUndefined();
  });

  it("keeps the transaction, so the feed can link to it on the explorer", () => {
    const tx = "0x63d966d4da4c0a3c93f82d6fd8775e051f282e27157da3e0d0f004e0a92c18d7";
    const a = mapActivity({ id: "5-3", creator_id: "1", actor: "0x1", kind: "Tip", amount: "5000000", refId: "9", text: "", timestamp: "1", txHash: tx }, new Map());
    expect(a.txHash).toBe(tx);
  });

  it("copes with an unknown actor and a creator-less event", () => {
    const a = mapActivity({ id: "5-2", creator_id: null, actor: "0xnobody", kind: "CharacterMinted", amount: "0", refId: "1", text: "joined", timestamp: "1" }, new Map());
    expect(a.creatorId).toBe("");
    expect(a.actorName).toBeUndefined();
    expect(a.txHash).toBeUndefined();
  });
});

describe("mapProtocol", () => {
  it("fills in zeros before anything is indexed", () => {
    expect(mapProtocol(undefined, 0)).toEqual({ creators: 0, players: 0, totalVolume: 0n, totalTreasury: 0n, quests: 0, battles: 0, questsCompleted: 0 });
  });

  it("maps a row", () => {
    const p = mapProtocol({ creators: 2, players: 9, totalVolume: "100000000", totalTreasury: "1500000", quests: 4, battles: 3 }, 2);
    expect(p).toMatchObject({ creators: 2, players: 9, totalVolume: 100n * USD, questsCompleted: 2 });
  });
});

describe("mapJuryCase", () => {
  const row = { id: "1", marketType: "Quest" as const, marketId: "3", creator_id: "1", jurors: ["0xa", "0xb", "0xc"], deadline: "1791113000", yesVotes: 1, noVotes: 0, resolved: false, verdict: "None" as const };

  it("words a quest claim from what the creator reported", () => {
    expect(mapJuryCase(row, questRow)).toMatchObject({
      claim: "karambol says “Beat the Ender Dragon” was completed.",
      proofUrl: "https://youtu.be/x",
      jurors: 3,
      deadline: 1_791_113_000_000,
    });
    expect(mapJuryCase(row, { ...questRow, proposedVerdict: "No" }).claim).toContain("failed");
  });

  it("words a battle claim with the side the creator said won", () => {
    expect(mapJuryCase({ ...row, marketType: "Battle", marketId: "2" }, battleRow).claim).toBe(
      "karambol says Lose won “Win this ranked match?”.",
    );
  });

  it("still gives a sensible sentence when the market is missing", () => {
    expect(mapJuryCase(row, undefined).claim).toBe("The creator reported a result.");
  });
});
