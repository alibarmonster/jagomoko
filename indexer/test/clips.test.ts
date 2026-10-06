import { describe, it } from "vitest";
import { createTestIndexer, TestHelpers, type Address } from "envio";

const [streamer, alice, bob, carol, dave] = TestHelpers.Addresses.mockAddresses;
const CHAIN = 31337;
const USD = 1_000_000n;
const T0 = 1_700_000_000;
// simulated events in one block share a transaction, so a block here stands for one transaction
const block = (n: number) => ({ number: n, timestamp: T0 + n });

// Addresses from config.local.yaml
const CLIP_BOARD: Address = "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d";

const KIND = { Clip: 3n, Governance: 5n };

const setup = [
  {
    contract: "CreatorRegistry",
    event: "CreatorRegistered",
    block: block(1),
    params: { creatorId: 1n, owner: streamer, handle: "neon", creatorBps: 9_800n, treasuryBps: 100n, communityBps: 100n },
  },
  { contract: "Character", event: "CharacterMinted", block: block(2), params: { player: alice, tokenId: 1n, role: 0n, name: "Knight-a1b2" } },
  { contract: "Character", event: "CharacterMinted", block: block(2), params: { player: bob, tokenId: 2n, role: 1n, name: "Seer-b2c3" } },
  { contract: "Character", event: "CharacterMinted", block: block(2), params: { player: carol, tokenId: 3n, role: 3n, name: "Bard-c3d4" } },
  { contract: "Character", event: "CharacterMinted", block: block(2), params: { player: dave, tokenId: 4n, role: 3n, name: "Bard-d4e5" } },
  {
    contract: "ClipBoard",
    event: "BountyCreated",
    block: block(3),
    params: { bountyId: 1n, creatorId: 1n, by: streamer, title: "Best clip of the boss fight", reward: 10n * USD, submitEnd: BigInt(T0 + 600), voteEnd: BigInt(T0 + 1200) },
  },
] as const;

function xpChanged(player: Address, delta: bigint, newXp: bigint, kind: bigint, b: number) {
  return { contract: "Character", event: "XPChanged", block: block(b), params: { player, tokenId: 1n, newXp, delta, kind } } as const;
}

describe("clip bounties", () => {
  it("tracks a community-funded bounty from the first clip to the winner", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            // the community votes $20 to the clip board, and the creator attaches it
            {
              contract: "CommunityTreasury",
              event: "ProposalCreated",
              block: block(4),
              params: { proposalId: 1n, creatorId: 1n, proposer: alice, kind: 0n, recipient: CLIP_BOARD, amount: 20n * USD, description: "Clip bounty pool", endsAt: BigInt(T0 + 86400) },
            },
            { contract: "CommunityTreasury", event: "ProposalFinalized", block: block(5), params: { proposalId: 1n, status: 1n } },
            { contract: "ClipBoard", event: "BountyFunded", block: block(6), params: { bountyId: 1n, proposalId: 1n, amount: 20n * USD } },
            // carol's clip, with tracking junk on the link; dave's points at a look-alike site
            xpChanged(carol, 30n, 30n, KIND.Clip, 7),
            {
              contract: "ClipBoard",
              event: "ClipSubmitted",
              block: block(7),
              params: { clipId: 1n, bountyId: 1n, author: carol, url: "https://www.tiktok.com/@carol/video/7300000000000000001?is_from_webapp=1&sender_device=pc" },
            },
            xpChanged(dave, 30n, 30n, KIND.Clip, 8),
            {
              contract: "ClipBoard",
              event: "ClipSubmitted",
              block: block(8),
              params: { clipId: 2n, bountyId: 1n, author: dave, url: "https://eviltiktok.com/@dave/video/7300000000000000002" },
            },
            { contract: "ClipBoard", event: "ClipHidden", block: block(9), params: { clipId: 2n, bountyId: 1n, hidden: true } },
            // bob votes for carol: his Governance XP, then her Clip XP, then the vote
            xpChanged(bob, 5n, 5n, KIND.Governance, 10),
            xpChanged(carol, 7n, 37n, KIND.Clip, 10),
            { contract: "ClipBoard", event: "ClipVoted", block: block(10), params: { clipId: 1n, bountyId: 1n, voter: bob, weight: 20n } },
            xpChanged(carol, 450n, 487n, KIND.Clip, 11),
            { contract: "ClipBoard", event: "BountyWon", block: block(11), params: { bountyId: 1n, clipId: 1n, author: carol, amount: 30n * USD } },
          ],
        },
      },
    });

    t.expect(await indexer.Bounty.getOrThrow("1")).toMatchObject({
      title: "Best clip of the boss fight",
      escrow: 10n * USD,
      communityFunds: 20n * USD,
      clipCount: 2,
      voteCount: 1,
      status: "Won",
      winner_id: "1",
      paidOut: 30n * USD,
    });
    t.expect(await indexer.Clip.getOrThrow("1")).toMatchObject({
      url: "https://www.tiktok.com/@carol/video/7300000000000000001",
      platform: "tiktok",
      weight: 20n,
      votes: 1,
      won: true,
      authorPlayer_id: carol,
    });
    // the look-alike link is never stored
    t.expect(await indexer.Clip.getOrThrow("2")).toMatchObject({ url: undefined, platform: undefined, hidden: true });
    t.expect(await indexer.ClipVote.getOrThrow(`1-${bob}`)).toMatchObject({ clip_id: "1", bountyId: "1", weight: 20n });
    t.expect(await indexer.Proposal.getOrThrow("1")).toMatchObject({ attachedTo_id: "1", returned: false });
    t.expect(await indexer.BountyFunding.getOrThrow("1")).toMatchObject({ bounty_id: "1", amount: 20n * USD });

    // guild credit: carol's clip, the vote it got and the win; bob's vote
    t.expect(await indexer.Member.getOrThrow(`1-${carol}`)).toMatchObject({ guildXp: 487n, actions: 1 });
    t.expect(await indexer.Member.getOrThrow(`1-${bob}`)).toMatchObject({ guildXp: 5n, actions: 1 });
    t.expect(await indexer.Creator.getOrThrow("1")).toMatchObject({ jago_id: `1-${carol}`, jagoXp: 487n });
    t.expect(await indexer.PendingXP.getAll()).toEqual([]);

    // links never reach the feed, and votes carry no dollar amount
    const feed = await indexer.Activity.getAll();
    t.expect(feed.some((a) => /https?:|tiktok/i.test(a.text))).toBe(false);
    t.expect(feed.find((a) => a.kind === "ClipVoted")).toMatchObject({ amount: 0n, text: 'voted in "Best clip of the boss fight"' });
    t.expect(feed.find((a) => a.kind === "BountyWon")).toMatchObject({ actor: carol, amount: 30n * USD });
  });

  it("marks a bounty without a winner as refunded", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [...setup, { contract: "ClipBoard", event: "BountyRefunded", block: block(4), params: { bountyId: 1n, toFunder: 10n * USD, toTreasury: 0n } }],
        },
      },
    });
    t.expect((await indexer.Bounty.getOrThrow("1")).status).toBe("Refunded");
    t.expect((await indexer.Activity.getAll()).find((a) => a.kind === "BountyRefunded")).toMatchObject({ amount: 10n * USD });
  });

  it("remembers a payout that went back to the treasury", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            {
              contract: "CommunityTreasury",
              event: "ProposalCreated",
              block: block(4),
              params: { proposalId: 1n, creatorId: 1n, proposer: alice, kind: 0n, recipient: CLIP_BOARD, amount: 5n * USD, description: "Pool", endsAt: BigInt(T0 + 86400) },
            },
            { contract: "CommunityTreasury", event: "ProposalFinalized", block: block(5), params: { proposalId: 1n, status: 1n } },
            { contract: "ClipBoard", event: "ProposalFundsReturned", block: block(6), params: { proposalId: 1n, creatorId: 1n, amount: 5n * USD } },
          ],
        },
      },
    });
    t.expect(await indexer.Proposal.getOrThrow("1")).toMatchObject({ attachedTo_id: undefined, returned: true });
  });
});
