import { describe, expect, it } from "vitest";
import { levelForXp } from "../xp";
import { buildSampleWorld, sampleAddress } from "./sample";

describe("sample world", () => {
  const w = buildSampleWorld(1_760_000_000_000);

  it("is deterministic for a given clock", () => {
    expect(buildSampleWorld(1_760_000_000_000).players.map((p) => p.id)).toEqual(w.players.map((p) => p.id));
  });

  it("addresses look like addresses and are stable", () => {
    expect(sampleAddress("alice")).toMatch(/^0x[0-9a-f]{40}$/);
    expect(sampleAddress("alice")).toBe(sampleAddress("alice"));
    expect(sampleAddress("alice")).not.toBe(sampleAddress("bob"));
  });

  it("player levels follow the contract formula", () => {
    for (const p of w.players) expect(p.level).toBe(levelForXp(p.xp));
  });

  it("every quest and battle belongs to the realm and has a sane lifecycle", () => {
    for (const q of w.quests) {
      expect(q.creatorId).toBe(w.creator.id);
      if (q.status === "Failed") expect(q.refundable + q.toTreasury).toBe(q.pool);
      if (q.status === "Succeeded") expect(q.toCreatorVault).toBe(q.pool);
      if (q.status === "Proposed") expect(q.challengeDeadline).toBeGreaterThan(w.now);
    }
    for (const b of w.battles) {
      expect(b.creatorId).toBe(w.creator.id);
      if (b.pointsMode) expect(b.poolA + b.poolB).toBe(0n);
    }
  });

  it("the creator split is always valid", () => {
    const c = w.creator;
    expect(c.creatorBps + c.treasuryBps + c.communityBps).toBe(10_000);
    expect(c.treasuryBps + c.communityBps).toBeGreaterThanOrEqual(200);
  });

  it("proof links in the sample are all plain https", () => {
    for (const q of w.quests) if (q.proofUrl) expect(q.proofUrl.startsWith("https://")).toBe(true);
  });
});
