import { describe, expect, it } from "vitest";
import { ALERT_HOLD_MS, alertTier, MAX_EVENT_AGE_MS, newOverlayEvents, overlayEvent, testOverlayEvent } from "./overlay-events";
import { TEST_KINDS } from "./overlay-test";
import type { Activity } from "./data/types";

const USD = 1_000_000n;
const NOW = 1_800_000_000_000;

const act = (over: Partial<Activity>): Activity => ({
  id: "1-1",
  creatorId: "1",
  actor: "0xa",
  actorName: "Alice",
  actorRole: "Knight",
  actorLevel: 7,
  kind: "Tip",
  amount: 5n * USD,
  refId: "1",
  text: "",
  timestamp: NOW - 2_000,
  ...over,
});

describe("overlayEvent", () => {
  it("turns a tip, a backing and a pick into alerts with the viewer's name, role and level", () => {
    expect(overlayEvent(act({ kind: "Tip" }))?.alert).toEqual({ name: "Alice", role: "Knight", level: 7, text: "tipped $5", tier: "cheer", moko: false, jago: false });
    expect(overlayEvent(act({ kind: "QuestBacked", amount: 10n * USD }))?.alert?.text).toBe("backed $10");
    expect(overlayEvent(act({ kind: "BattleJoined", amount: 20n * USD }))?.alert?.text).toBe("picked a side with $20");
    expect(overlayEvent(act({ kind: "BattleJoined", amount: 0n }))?.alert?.text).toBe("picked a side");
  });

  it("does not claim a role or level for someone without a character", () => {
    const e = overlayEvent(act({ actorName: undefined, actorRole: undefined, actorLevel: undefined }));
    expect(e?.alert).toEqual({ name: "A viewer", role: undefined, level: undefined, text: "tipped $5", tier: "cheer", moko: true, jago: false });
  });

  it("shows an anonymous tip as Anonymous, with no role or level", () => {
    const e = overlayEvent(act({ actor: "", actorName: "Anonymous", actorRole: undefined, actorLevel: undefined, anonymous: true }), { jago: "0xa" });
    expect(e?.alert).toEqual({ name: "Anonymous", role: undefined, level: undefined, text: "tipped $5", tier: "cheer", moko: true, jago: false });
  });

  it("makes outcome banners, red for a failure or a void and green otherwise", () => {
    expect(overlayEvent(act({ kind: "QuestResolved", text: "Quest complete" }))?.outcome).toEqual({ tone: "success", text: "Quest complete" });
    expect(overlayEvent(act({ kind: "QuestResolved", text: "Quest failed: 90% refunded" }))?.outcome?.tone).toBe("danger");
    expect(overlayEvent(act({ kind: "BattleResolved", text: "Battle voided: stakes refunded" }))?.outcome?.tone).toBe("danger");
    expect(overlayEvent(act({ kind: "BattleResolved", text: "Win wins!" }))?.outcome?.tone).toBe("success");
  });

  it("sizes the moment by the money: a peek under $5, a cheer to $24.99, a party from $25", () => {
    expect(alertTier(4_990_000n)).toBe("peek");
    expect(alertTier(5n * USD)).toBe("cheer");
    expect(alertTier(24_990_000n)).toBe("cheer");
    expect(alertTier(25n * USD)).toBe("party");
    expect(overlayEvent(act({ amount: 2n * USD }))?.alert?.tier).toBe("peek");
    expect(overlayEvent(act({ kind: "QuestBacked", amount: 50n * USD }))?.alert?.tier).toBe("party");
    expect(overlayEvent(act({ kind: "BattleJoined", amount: 0n }))?.alert?.tier).toBe("peek");
    expect([ALERT_HOLD_MS.peek, ALERT_HOLD_MS.cheer, ALERT_HOLD_MS.party]).toEqual([6_000, 6_000, 9_000]);
  });

  it("crowns the guild's Jago, whatever the case of the address", () => {
    expect(overlayEvent(act({ actor: "0xAbC" }), { jago: "0xabc" })?.alert?.jago).toBe(true);
    expect(overlayEvent(act({ actor: "0xdef" }), { jago: "0xabc" })?.alert?.jago).toBe(false);
  });

  it("celebrates a clip bounty win as a party, and never shows the link", () => {
    const e = overlayEvent(act({ kind: "BountyWon", actorRole: "Bard", amount: 20n * USD, text: "won \"Best clip\"" }));
    expect(e?.alert).toMatchObject({ text: "won the clip bounty ($20)", tier: "party" });
  });

  it("ignores everything else", () => {
    for (const kind of ["CreatorJoined", "CharacterMinted", "QuestCreated", "QuestProposed", "JuryCaseOpened", "ProposalVoted", "TreasurySpent", "ClipSubmitted", "ClipVoted"] as const) {
      expect(overlayEvent(act({ kind }))).toBeNull();
    }
  });
});

describe("testOverlayEvent", () => {
  it("makes each test alert the way a real one reads, from a test viewer", () => {
    expect(testOverlayEvent("tip", "t1").alert).toMatchObject({ name: "Test viewer", role: "Knight", level: 7, text: "tipped $5", tier: "cheer" });
    expect(testOverlayEvent("quest", "t2").alert?.text).toBe("backed $10");
    expect(testOverlayEvent("battle", "t3").alert?.text).toBe("picked a side with $20");
    expect(testOverlayEvent("anonymous", "t4").alert).toMatchObject({ name: "Anonymous", role: undefined, level: undefined, text: "tipped $5", moko: true });
    expect(testOverlayEvent("party", "t6").alert).toMatchObject({ text: "tipped $25", tier: "party" });
    expect(testOverlayEvent("clip", "t7").alert).toMatchObject({ name: "Test Bard", role: "Bard", text: "won the clip bounty ($20)", tier: "party" });
    expect(testOverlayEvent("result", "t5").outcome).toEqual({ tone: "success", text: "Quest complete" });
  });

  it("keeps the id it was given, so the overlay can tell tests apart", () => {
    for (const kind of TEST_KINDS) expect(testOverlayEvent(kind, `test-${kind}`).id).toBe(`test-${kind}`);
  });

  it("makes something visible for every kind", () => {
    for (const kind of TEST_KINDS) {
      const e = testOverlayEvent(kind, "x");
      expect(Boolean(e.alert) || Boolean(e.outcome), kind).toBe(true);
    }
  });
});

describe("newOverlayEvents", () => {
  it("shows only what is new, oldest first, and remembers it", () => {
    const seen = new Set<string>();
    const a = act({ id: "5-1", timestamp: NOW - 4_000 });
    const b = act({ id: "5-2", timestamp: NOW - 1_000, kind: "QuestBacked" });
    const first = newOverlayEvents([b, a], seen, NOW);
    expect(first.map((e) => e.id)).toEqual(["5-1", "5-2"]);
    expect(newOverlayEvents([b, a], seen, NOW)).toEqual([]);
  });

  it("never replays a backlog: old events are marked seen but not shown", () => {
    const seen = new Set<string>();
    const old = act({ id: "1-9", timestamp: NOW - MAX_EVENT_AGE_MS - 1 });
    expect(newOverlayEvents([old], seen, NOW)).toEqual([]);
    expect(seen.has("1-9")).toBe(true);
  });

  it("skips activity that is not worth showing, but still remembers it", () => {
    const seen = new Set<string>();
    expect(newOverlayEvents([act({ id: "2-1", kind: "QuestCreated" })], seen, NOW)).toEqual([]);
    expect(seen.has("2-1")).toBe(true);
  });
});
