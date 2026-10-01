import { describe, it } from "vitest";
import { createTestIndexer, TestHelpers, type Address } from "envio";

const [streamer, alice, bob, attacker] = TestHelpers.Addresses.mockAddresses;
const CHAIN = 31337;
const USD = 1_000_000n;
const T0 = 1_700_000_000;
const block = (n: number) => ({ number: n, timestamp: T0 + n });

// Addresses from config.local.yaml
const QUEST_ESCROW: Address = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";

const setup = [
  {
    contract: "CreatorRegistry",
    event: "CreatorRegistered",
    block: block(1),
    params: { creatorId: 1n, owner: streamer, handle: "Shroud‮gnp.exe​", creatorBps: 8000n, treasuryBps: 1500n, communityBps: 500n },
  },
  { contract: "Character", event: "CharacterMinted", block: block(2), params: { player: alice, tokenId: 1n, role: 0n, name: "Alice" } },
  { contract: "Character", event: "CharacterMinted", block: block(2), params: { player: bob, tokenId: 2n, role: 2n, name: "Bob\u0000‮" } },
] as const;

describe("creators, characters and the vault", () => {
  it("sanitizes hostile names and splits deposits", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            {
              contract: "SplitVault",
              event: "Deposited",
              block: block(3),
              params: { creatorId: 1n, from: alice, amount: 10n * USD, creatorCut: 8n * USD, treasuryCut: 1_500_000n, communityCut: 500_000n, memo: "gg ‮wp" },
            },
            { contract: "Character", event: "XPChanged", block: block(3), params: { player: alice, tokenId: 1n, newXp: 1_600n, delta: 1_600n, kind: 4n } },
          ],
        },
      },
    });

    const creator = await indexer.Creator.getOrThrow("1");
    t.expect(creator.handle).toBe("Shroudgnp.exe");
    t.expect(creator.handleKey).toBe("shroudgnp.exe");
    t.expect(creator.handleSanitized).toBe(true);
    t.expect([creator.creatorBalance, creator.treasuryBalance, creator.communityBalance]).toEqual([8n * USD, 1_500_000n, 500_000n]);
    t.expect(creator.tipCount).toBe(1);

    const bobPlayer = await indexer.Player.getOrThrow(bob);
    t.expect(bobPlayer.name).toBe("Bob");
    t.expect(bobPlayer.role).toBe("Judge");

    const alicePlayer = await indexer.Player.getOrThrow(alice);
    t.expect(alicePlayer.totalTipped).toBe(10n * USD);
    t.expect(alicePlayer.xp).toBe(1_600n);
    t.expect(alicePlayer.level).toBe(5);

    const protocol = await indexer.Protocol.getOrThrow("global");
    t.expect(protocol).toMatchObject({ creators: 1, players: 2, totalVolume: 10n * USD, totalTreasury: 1_500_000n });

    const activities = await indexer.Activity.getAll();
    const tip = activities.find((a) => a.kind === "Tip");
    t.expect(tip?.text).toBe("gg wp");
  });

  it("refuses deposits whose cuts don't add up (index/contract mismatch)", async (t) => {
    const indexer = createTestIndexer();
    await t
      .expect(
        indexer.process({
          chains: {
            [CHAIN]: {
              simulate: [
                setup[0],
                {
                  contract: "SplitVault",
                  event: "Deposited",
                  block: block(3),
                  params: { creatorId: 1n, from: alice, amount: 10n * USD, creatorCut: 10n * USD, treasuryCut: 1n, communityCut: 0n, memo: "" },
                },
              ],
            },
          },
        }),
      )
      .rejects.toThrow(/cuts do not sum/);
  });

  it("refuses unknown enum values", async (t) => {
    const indexer = createTestIndexer();
    await t
      .expect(
        indexer.process({
          chains: { [CHAIN]: { simulate: [{ contract: "Character", event: "CharacterMinted", block: block(1), params: { player: alice, tokenId: 1n, role: 9n, name: "x" } }] } },
        }),
      )
      .rejects.toThrow(/Unknown Role/);
  });

  it("refuses events for creators that were never registered", async (t) => {
    const indexer = createTestIndexer();
    await t
      .expect(
        indexer.process({
          chains: {
            [CHAIN]: {
              simulate: [{ contract: "QuestEscrow", event: "QuestCreated", block: block(1), params: { questId: 1n, creatorId: 42n, title: "x", goalDeadline: 1n } }],
            },
          },
        }),
      )
      .rejects.toThrow();
  });
});

describe("quests", () => {
  it("tracks a failed quest end to end and drops unsafe proof links", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            { contract: "QuestEscrow", event: "QuestCreated", block: block(3), params: { questId: 1n, creatorId: 1n, title: "Beat the boss in < 1h", goalDeadline: BigInt(T0 + 3600) } },
            { contract: "QuestEscrow", event: "QuestBacked", block: block(4), params: { questId: 1n, backer: alice, amount: 10n * USD, newPool: 10n * USD } },
            { contract: "QuestEscrow", event: "QuestBacked", block: block(4), params: { questId: 1n, backer: attacker, amount: 30n * USD, newPool: 40n * USD } },
            { contract: "QuestEscrow", event: "QuestBacked", block: block(4), params: { questId: 1n, backer: alice, amount: 5n * USD, newPool: 45n * USD } },
            {
              contract: "QuestEscrow",
              event: "OutcomeProposed",
              block: block(5),
              params: { marketId: 1n, verdict: 2n, proposer: streamer, proofURI: "javascript:alert(document.cookie)", challengeDeadline: BigInt(T0 + 600) },
            },
            { contract: "QuestEscrow", event: "MarketResolved", block: block(6), params: { marketId: 1n, verdict: 2n } },
            { contract: "SplitVault", event: "TreasuryFunded", block: block(6), params: { creatorId: 1n, from: QUEST_ESCROW, amount: 4_500_000n, reason: "Quest failed" } },
            { contract: "QuestEscrow", event: "QuestSettled", block: block(6), params: { questId: 1n, verdict: 2n, toCreatorVault: 0n, toTreasury: 4_500_000n, refundable: 40_500_000n } },
            { contract: "QuestEscrow", event: "QuestClaimed", block: block(7), params: { questId: 1n, backer: alice, refund: 13_500_000n } },
          ],
        },
      },
    });

    const quest = await indexer.Quest.getOrThrow("1");
    t.expect(quest).toMatchObject({ status: "Failed", pool: 45n * USD, backers: 2, proofUrl: undefined, toTreasury: 4_500_000n, refundable: 40_500_000n });

    const aliceBacking = await indexer.Backing.getOrThrow(`1-${alice}`);
    t.expect(aliceBacking).toMatchObject({ amount: 15n * USD, claimed: true, refund: 13_500_000n, backer_id: alice });

    // backers without a character are still tracked, just not linked to a Player
    const anon = await indexer.Backing.getOrThrow(`1-${attacker}`);
    t.expect(anon.backer_id).toBeUndefined();

    t.expect((await indexer.Creator.getOrThrow("1")).treasuryBalance).toBe(4_500_000n);
    t.expect((await indexer.Player.getOrThrow(alice)).totalBacked).toBe(15n * USD);
  });

  it("keeps safe proof links and rejects inconsistent pools", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            { contract: "QuestEscrow", event: "QuestCreated", block: block(3), params: { questId: 1n, creatorId: 1n, title: "Speedrun", goalDeadline: BigInt(T0 + 3600) } },
            {
              contract: "QuestEscrow",
              event: "OutcomeProposed",
              block: block(4),
              params: { marketId: 1n, verdict: 1n, proposer: streamer, proofURI: "https://www.twitch.tv/videos/1?t=42m", challengeDeadline: BigInt(T0 + 600) },
            },
          ],
        },
      },
    });
    t.expect((await indexer.Quest.getOrThrow("1")).proofUrl).toBe("https://www.twitch.tv/videos/1?t=42m");

    const bad = createTestIndexer();
    await t
      .expect(
        bad.process({
          chains: {
            [CHAIN]: {
              simulate: [
                ...setup,
                { contract: "QuestEscrow", event: "QuestCreated", block: block(3), params: { questId: 1n, creatorId: 1n, title: "x", goalDeadline: 1n } },
                { contract: "QuestEscrow", event: "QuestBacked", block: block(4), params: { questId: 1n, backer: alice, amount: 1n, newPool: 999n } },
              ],
            },
          },
        }),
      )
      .rejects.toThrow(/pool mismatch/);
  });
});

describe("jury", () => {
  it("only accepts cases opened by the configured market contracts", async (t) => {
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
            { contract: "Jury", event: "JuryVoted", block: block(4), params: { caseId: 1n, juror: bob, verdict: 2n } },
            { contract: "Jury", event: "JurorRewarded", block: block(5), params: { caseId: 1n, juror: bob, fee: 500_000n } },
            { contract: "Jury", event: "CaseResolved", block: block(5), params: { caseId: 1n, verdict: 2n, yesVotes: 0n, noVotes: 1n } },
          ],
        },
      },
    });
    const c = await indexer.JuryCase.getOrThrow("1");
    t.expect(c).toMatchObject({ marketType: "Quest", resolved: true, verdict: "No", noVotes: 1, jurors: [bob] });
    t.expect((await indexer.JuryVote.getOrThrow(`1-${bob}`)).fee).toBe(500_000n);
    t.expect((await indexer.Player.getOrThrow(bob)).juryVotes).toBe(1);

    const spoofed = createTestIndexer();
    await t
      .expect(
        spoofed.process({
          chains: {
            [CHAIN]: {
              simulate: [
                ...setup,
                { contract: "Jury", event: "CaseOpened", block: block(3), params: { caseId: 1n, client: attacker, marketId: 1n, creatorId: 1n, jurors: [], deadline: 0n } },
              ],
            },
          },
        }),
      )
      .rejects.toThrow(/unknown client/);
  });
});

describe("battles and treasury", () => {
  it("tracks positions and rejects side switching", async (t) => {
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
              params: { battleId: 1n, creatorId: 1n, question: "Win this match?", sideA: "Win", sideB: "Lose", closeTime: BigInt(T0 + 300), pointsMode: false },
            },
            { contract: "PredictionBattle", event: "BattleJoined", block: block(4), params: { battleId: 1n, player: alice, side: 0n, amount: 10n * USD, poolA: 10n * USD, poolB: 0n } },
            { contract: "PredictionBattle", event: "BattleJoined", block: block(4), params: { battleId: 1n, player: bob, side: 1n, amount: 50n * USD, poolA: 10n * USD, poolB: 50n * USD } },
            { contract: "PredictionBattle", event: "MarketResolved", block: block(6), params: { marketId: 1n, verdict: 1n } },
            { contract: "PredictionBattle", event: "BattleSettled", block: block(6), params: { battleId: 1n, verdict: 1n, refundAll: false, toTreasury: 1n * USD, winnings: 49n * USD } },
            { contract: "PredictionBattle", event: "BattleClaimed", block: block(7), params: { battleId: 1n, player: alice, payout: 59n * USD, xp: 50n } },
            {
              contract: "CommunityTreasury",
              event: "ProposalCreated",
              block: block(8),
              params: { proposalId: 1n, creatorId: 1n, proposer: alice, recipient: alice, amount: USD, description: "Clip bounty‮\n\n\n\nbest clutch", endsAt: BigInt(T0 + 86400) },
            },
            { contract: "CommunityTreasury", event: "ProposalVoted", block: block(9), params: { proposalId: 1n, voter: bob, support: true, weight: 40n } },
            { contract: "CommunityTreasury", event: "ProposalFinalized", block: block(10), params: { proposalId: 1n, status: 1n } },
          ],
        },
      },
    });

    const battle = await indexer.Battle.getOrThrow("1");
    t.expect(battle).toMatchObject({ status: "Succeeded", poolA: 10n * USD, poolB: 50n * USD, playersA: 1, playersB: 1, winnings: 49n * USD });
    const alicePlayer = await indexer.Player.getOrThrow(alice);
    t.expect(alicePlayer).toMatchObject({ battlesWon: 1, totalWon: 49n * USD });

    const proposal = await indexer.Proposal.getOrThrow("1");
    t.expect(proposal).toMatchObject({ status: "Executed", forWeight: 40n, voters: 1, description: "Clip bounty\n\nbest clutch" });

    const cheat = createTestIndexer();
    await t
      .expect(
        cheat.process({
          chains: {
            [CHAIN]: {
              simulate: [
                ...setup,
                {
                  contract: "PredictionBattle",
                  event: "BattleCreated",
                  block: block(3),
                  params: { battleId: 1n, creatorId: 1n, question: "q", sideA: "A", sideB: "B", closeTime: 1n, pointsMode: false },
                },
                { contract: "PredictionBattle", event: "BattleJoined", block: block(4), params: { battleId: 1n, player: alice, side: 0n, amount: 1n, poolA: 1n, poolB: 0n } },
                { contract: "PredictionBattle", event: "BattleJoined", block: block(5), params: { battleId: 1n, player: alice, side: 1n, amount: 1n, poolA: 1n, poolB: 1n } },
              ],
            },
          },
        }),
      )
      .rejects.toThrow(/switched sides/);
  });
});
