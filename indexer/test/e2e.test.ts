// End-to-end: indexes REAL events from a local anvil chain seeded by
// contracts/script/Seed.s.sol, then cross-checks every indexed balance and XP
// total against live contract state. Opt-in: ENVIO_E2E=1 ENVIO_LOCAL_RPC_URL=...
import { describe, it } from "vitest";
import { createTestIndexer } from "envio";
import { createPublicClient, http, parseAbi, type Address } from "viem";

const RPC = process.env.ENVIO_LOCAL_RPC_URL ?? "http://127.0.0.1:8545";
const USD = 1_000_000n;

// config.local.yaml addresses / anvil test accounts used by Seed.s.sol
const VAULT: Address = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
const CHARACTER: Address = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
const PLAYERS: Address[] = [
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // alice
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906", // bob
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", // carol
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", // dave
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9", // erin
];

const abi = parseAbi([
  "function creatorBalance(uint256) view returns (uint256)",
  "function treasuryBalance(uint256) view returns (uint256)",
  "function communityBalance(uint256) view returns (uint256)",
  "function xpOf(address) view returns (uint256)",
]);

describe.skipIf(!process.env.ENVIO_E2E)("e2e against seeded anvil", () => {
  it("indexes the seeded story and matches on-chain state exactly", async (t) => {
    const client = createPublicClient({ transport: http(RPC) });
    const head = Number(await client.getBlockNumber());

    const indexer = createTestIndexer();
    await indexer.process({ chains: { 31337: { startBlock: 0, endBlock: head } } });

    // --- the story ---
    const creator = await indexer.Creator.getOrThrow("1");
    t.expect(creator).toMatchObject({ handle: "NeonBlade", handleKey: "neonblade", handleSanitized: false });

    const q1 = await indexer.Quest.getOrThrow("1");
    t.expect(q1).toMatchObject({ status: "Succeeded", pool: 30n * USD, toCreatorVault: 30n * USD, backers: 2 });
    t.expect(q1.proofUrl).toBe("https://www.twitch.tv/videos/123456789?t=0h42m10s");

    const q2 = await indexer.Quest.getOrThrow("2");
    t.expect(q2).toMatchObject({ status: "Failed", proposedVerdict: "Yes", toTreasury: 1n * USD, refundable: 9n * USD, juryCase_id: "1" });
    t.expect(q2.proofUrl, "javascript: proof link must never be stored").toBeUndefined();

    const juryCase = await indexer.JuryCase.getOrThrow("1");
    t.expect(juryCase).toMatchObject({ marketType: "Quest", verdict: "No", yesVotes: 1, noVotes: 2, resolved: true });
    t.expect(juryCase.jurors).toHaveLength(3);

    const b1 = await indexer.Battle.getOrThrow("1");
    t.expect(b1).toMatchObject({ status: "Succeeded", poolA: 10n * USD, poolB: 30n * USD, toTreasury: 600_000n, winnings: 29_400_000n });
    const b2 = await indexer.Battle.getOrThrow("2");
    t.expect(b2).toMatchObject({ status: "Failed", pointsMode: true, playersA: 1, playersB: 1 });

    t.expect((await indexer.Proposal.getOrThrow("1")).status).toBe("Executed");
    t.expect((await indexer.Backing.getOrThrow(`2-${PLAYERS[0]}`)).refund).toBe(4_500_000n);

    // --- index == chain ---
    const read = (functionName: "creatorBalance" | "treasuryBalance" | "communityBalance") =>
      client.readContract({ address: VAULT, abi, functionName, args: [1n] });
    t.expect(creator.creatorBalance).toBe(await read("creatorBalance"));
    t.expect(creator.treasuryBalance).toBe(await read("treasuryBalance"));
    t.expect(creator.communityBalance).toBe(await read("communityBalance"));

    for (const addr of PLAYERS) {
      const player = await indexer.Player.getOrThrow(addr);
      const onchain = await client.readContract({ address: CHARACTER, abi, functionName: "xpOf", args: [addr] });
      t.expect(player.xp, `xp of ${player.name}`).toBe(onchain);
    }

    const activities = await indexer.Activity.getAll();
    t.expect(activities.length).toBeGreaterThan(20);
  });
});
