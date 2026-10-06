import { describe, it } from "vitest";
import { createTestIndexer, TestHelpers, type Address } from "envio";

const [streamer, alice, sepoliaWallet] = TestHelpers.Addresses.mockAddresses;
const CHAIN = 31337;
const USD = 1_000_000n;
const T0 = 1_700_000_000;
const SEPOLIA = 40161n;
const GUID = "0x94fc33b7f4b7fd31fff7114ae85f10bc047c8e816cadb6919ade8fb677024810";
// simulated events in one block share a transaction, so a block here stands for one transaction
const block = (n: number) => ({ number: n, timestamp: T0 + n });

const setup = [
  {
    contract: "CreatorRegistry",
    event: "CreatorRegistered",
    block: block(1),
    params: { creatorId: 1n, owner: streamer, handle: "neon", creatorBps: 9_800n, treasuryBps: 100n, communityBps: 100n },
  },
  { contract: "Character", event: "CharacterMinted", block: block(2), params: { player: alice, tokenId: 1n, role: 0n, name: "Knight-a1b2" } },
] as const;

function deposited(from: Address, amount: bigint, memo: string, b: number) {
  const cut = amount / 100n;
  return {
    contract: "SplitVault",
    event: "Deposited",
    block: block(b),
    params: { creatorId: 1n, from, amount, creatorCut: amount - 2n * cut, treasuryCut: cut, communityCut: cut, memo },
  } as const;
}

function crossChainTip(donor: Address, amount: bigint, b: number, creatorId = 1n) {
  return { contract: "TipReceiver", event: "CrossChainTip", block: block(b), params: { guid: GUID, srcEid: SEPOLIA, donor, creatorId, amount } } as const;
}

function bounced(donor: Address, amount: bigint, reason: bigint, b: number, creatorId = 1n) {
  return {
    contract: "TipReceiver",
    event: "TipBounced",
    block: block(b),
    params: { guid: GUID, srcEid: SEPOLIA, donor, creatorId, amount, reason },
  } as const;
}

describe("cross-chain tips", () => {
  it("marks a tip delivered by LayerZero with the chain it came from", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [...setup, crossChainTip(sepoliaWallet, 5n * USD, 3), deposited(sepoliaWallet, 5n * USD, "gg from Sepolia", 3), deposited(alice, 2n * USD, "local", 4)],
        },
      },
    });

    const deposits = await indexer.Deposit.getAll();
    const remote = deposits.find((d) => d.from === sepoliaWallet);
    const local = deposits.find((d) => d.from === alice);
    t.expect(remote).toMatchObject({ via: 40161, lzGuid: GUID, memo: "gg from Sepolia", amount: 5n * USD, anonymous: false });
    t.expect(local?.via).toBeUndefined();
    t.expect(local?.lzGuid).toBeUndefined();

    const tips = (await indexer.Activity.getAll()).filter((a) => a.kind === "Tip");
    t.expect(tips.find((a) => a.actor === sepoliaWallet)?.via).toBe(40161);
    t.expect(tips.find((a) => a.actor === alice)?.via).toBeUndefined();
    t.expect(await indexer.PendingSource.getAll()).toEqual([]);

    // the wallet has no character on Monad: it is not a guild member (alice, who tipped on Monad, is)
    const members = await indexer.Member.getAll();
    t.expect(members.map((m) => m.player_id)).toEqual([alice]);
  });

  it("keeps an anonymous cross-chain tip anonymous", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: { [CHAIN]: { simulate: [...setup, crossChainTip(sepoliaWallet, 5n * USD, 3), deposited(sepoliaWallet, 5n * USD, "[anon] hi", 3)] } },
    });
    const [tip] = (await indexer.Activity.getAll()).filter((a) => a.kind === "Tip");
    t.expect(tip).toMatchObject({ anonymous: true, actor: "0x0000000000000000000000000000000000000000", via: 40161, text: "hi" });
  });

  it("records a bounced tip and clears what was parked for it", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            ...setup,
            // the deposit failed (unknown guild 9): the dollars went to the wallet on Monad
            crossChainTip(sepoliaWallet, 5n * USD, 3, 9n),
            bounced(sepoliaWallet, 5n * USD, 2n, 3, 9n),
            // over the limit: nothing was minted (no CrossChainTip before it)
            bounced(sepoliaWallet, 500n * USD, 1n, 4),
          ],
        },
      },
    });
    t.expect(await indexer.PendingSource.getAll()).toEqual([]);
    t.expect(await indexer.Deposit.getAll()).toEqual([]);
    const rows = (await indexer.Activity.getAll()).filter((a) => a.kind === "TipBounced");
    t.expect(rows).toHaveLength(2);
    const unknownGuild = rows.find((a) => a.amount === 5n * USD);
    const overLimit = rows.find((a) => a.amount === 500n * USD);
    t.expect(unknownGuild).toMatchObject({ creator_id: undefined, actor: sepoliaWallet, refId: GUID, via: 40161 });
    t.expect(unknownGuild?.text).toBe("sent a tip from another chain that could not reach this guild, so it went back to them");
    t.expect(overLimit).toMatchObject({ creator_id: "1", via: 40161 });
    t.expect(overLimit?.text).toContain("over the limit");
  });
});
