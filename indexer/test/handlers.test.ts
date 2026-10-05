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
    params: { creatorId: 1n, owner: streamer, handle: "Shroud\u202Egnp.exe\u200B", creatorBps: 8000n, treasuryBps: 1500n, communityBps: 500n },
  },
  { contract: "Character", event: "CharacterMinted", block: block(2), params: { player: alice, tokenId: 1n, role: 0n, name: "Alice" } },
  { contract: "Character", event: "CharacterMinted", block: block(2), params: { player: bob, tokenId: 2n, role: 2n, name: "Bob\u0000\u202E" } },
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
              params: { creatorId: 1n, from: alice, amount: 10n * USD, creatorCut: 8n * USD, treasuryCut: 1_500_000n, communityCut: 500_000n, memo: "gg \u202Ewp" },
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

  it("hides the tipper on an anonymous tip but still credits them", async (t) => {
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
              params: { creatorId: 1n, from: alice, amount: 5n * USD, creatorCut: 4n * USD, treasuryCut: 750_000n, communityCut: 250_000n, memo: "[anon] gg wp" },
            },
            {
              contract: "SplitVault",
              event: "Deposited",
              block: block(4),
              params: { creatorId: 1n, from: bob, amount: 1n * USD, creatorCut: 800_000n, treasuryCut: 150_000n, communityCut: 50_000n, memo: "hi" },
            },
          ],
        },
      },
    });

    const tips = (await indexer.Activity.getAll()).filter((a) => a.kind === "Tip");
    const hidden = tips.find((a) => a.text === "gg wp");
    t.expect(hidden).toMatchObject({ anonymous: true, actor: "0x0000000000000000000000000000000000000000", amount: 5n * USD });
    t.expect(tips.find((a) => a.text === "hi")).toMatchObject({ anonymous: false, actor: bob });
    // no stored row names alice as the actor of an anonymous tip, or keeps the marker
    t.expect(tips.some((a) => a.actor === alice || a.text.includes("[anon]"))).toBe(false);

    // her own history still has it, and she keeps the credit
    const deposits = await indexer.Deposit.getAll();
    t.expect(deposits.find((d) => d.memo === "gg wp")).toMatchObject({ from: alice, anonymous: true });
    t.expect((await indexer.Player.getOrThrow(alice)).totalTipped).toBe(5n * USD);
    t.expect((await indexer.Creator.getOrThrow("1")).tipCount).toBe(2);
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
              params: { proposalId: 1n, creatorId: 1n, proposer: alice, kind: 0n, recipient: alice, amount: USD, description: "Clip bounty\u202E\n\n\n\nbest clutch", endsAt: BigInt(T0 + 86400) },
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
    t.expect(proposal).toMatchObject({ kind: "Spend", status: "Executed", forWeight: 40n, voters: 1, description: "Clip bounty\n\nbest clutch" });

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

describe("treasury yield", () => {
  const ZERO = "0x0000000000000000000000000000000000000000";
  const deposit = {
    contract: "SplitVault",
    event: "Deposited",
    block: block(3),
    params: { creatorId: 1n, from: alice, amount: 1_000n * USD, creatorCut: 800n * USD, treasuryCut: 150n * USD, communityCut: 50n * USD, memo: "" },
  } as const;

  it("moves money between the liquid balance and the strategy and keeps the cost basis", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            deposit,
            { contract: "SplitVault", event: "TreasuryTargetSet", block: block(4), params: { creatorId: 1n, bps: 5_000n } },
            // $75 goes in for 75,000 shares
            { contract: "SplitVault", event: "TreasuryInvested", block: block(5), params: { creatorId: 1n, assets: 75n * USD, shares: 75_000n * USD } },
            // half the shares come back worth $40: the $37.50 they cost plus $2.50 of yield
            { contract: "SplitVault", event: "TreasuryDivested", block: block(6), params: { creatorId: 1n, assets: 40n * USD, shares: 37_500n * USD } },
          ],
        },
      },
    });

    const c = await indexer.Creator.getOrThrow("1");
    t.expect(c).toMatchObject({
      treasuryTargetBps: 5_000,
      treasuryBalance: 115n * USD, // 150 - 75 + 40
      treasuryShares: 37_500n * USD,
      treasuryInvestedCost: 37_500_000n,
      treasuryYieldRealized: 2_500_000n,
    });
    const kinds = (await indexer.VaultFlow.getAll()).map((f) => f.kind).sort();
    t.expect(kinds).toEqual(["TreasuryDivested", "TreasuryInvested"]);
    const feed = (await indexer.Activity.getAll()).filter((a) => a.kind === "TreasuryInvested" || a.kind === "TreasuryDivested");
    t.expect(feed).toHaveLength(2);
  });

  it("refuses to invest more than the liquid balance or redeem more shares than exist", async (t) => {
    const overInvest = createTestIndexer();
    await t
      .expect(
        overInvest.process({
          chains: {
            [CHAIN]: {
              simulate: [
                ...setup,
                deposit,
                { contract: "SplitVault", event: "TreasuryInvested", block: block(4), params: { creatorId: 1n, assets: 151n * USD, shares: 1n } },
              ],
            },
          },
        }),
      )
      .rejects.toThrow(/treasuryBalance would go negative/);

    const overRedeem = createTestIndexer();
    await t
      .expect(
        overRedeem.process({
          chains: {
            [CHAIN]: {
              simulate: [
                ...setup,
                deposit,
                { contract: "SplitVault", event: "TreasuryDivested", block: block(4), params: { creatorId: 1n, assets: 1n, shares: 1n } },
              ],
            },
          },
        }),
      )
      .rejects.toThrow(/treasuryShares would go negative/);
  });

  it("indexes an allocation proposal as basis points, not dollars", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            {
              contract: "CommunityTreasury",
              event: "ProposalCreated",
              block: block(3),
              params: { proposalId: 1n, creatorId: 1n, proposer: alice, kind: 1n, recipient: ZERO, amount: 2_500n, description: "Put a quarter of the treasury to work", endsAt: BigInt(T0 + 86400) },
            },
            { contract: "CommunityTreasury", event: "ProposalFinalized", block: block(4), params: { proposalId: 1n, status: 1n } },
          ],
        },
      },
    });

    t.expect(await indexer.Proposal.getOrThrow("1")).toMatchObject({ kind: "Allocate", amount: 2_500n, status: "Executed" });
    const feed = (await indexer.Activity.getAll()).filter((a) => a.kind === "ProposalCreated" || a.kind === "ProposalFinalized");
    t.expect(feed.map((a) => a.amount)).toEqual([0n, 0n]);
  });
});
