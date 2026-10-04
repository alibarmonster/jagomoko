import { describe, expect, it } from "vitest";
import { MAX_EVENT_AGE_MS, newOverlayEvents, overlayEvent } from "./overlay-events";
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
    expect(overlayEvent(act({ kind: "Tip" }))?.alert).toEqual({ name: "Alice", role: "Knight", level: 7, text: "tipped $5" });
    expect(overlayEvent(act({ kind: "QuestBacked", amount: 10n * USD }))?.alert?.text).toBe("backed $10");
    expect(overlayEvent(act({ kind: "BattleJoined", amount: 20n * USD }))?.alert?.text).toBe("picked a side with $20");
    expect(overlayEvent(act({ kind: "BattleJoined", amount: 0n }))?.alert?.text).toBe("picked a side");
  });

  it("does not claim a role or level for someone without a character", () => {
    const e = overlayEvent(act({ actorName: undefined, actorRole: undefined, actorLevel: undefined }));
    expect(e?.alert).toEqual({ name: "A viewer", role: undefined, level: undefined, text: "tipped $5" });
  });

  it("makes outcome banners, red for a failure or a void and green otherwise", () => {
    expect(overlayEvent(act({ kind: "QuestResolved", text: "Quest complete" }))?.outcome).toEqual({ tone: "success", text: "Quest complete" });
    expect(overlayEvent(act({ kind: "QuestResolved", text: "Quest failed: 90% refunded" }))?.outcome?.tone).toBe("danger");
    expect(overlayEvent(act({ kind: "BattleResolved", text: "Battle voided: stakes refunded" }))?.outcome?.tone).toBe("danger");
    expect(overlayEvent(act({ kind: "BattleResolved", text: "Win wins!" }))?.outcome?.tone).toBe("success");
  });

  it("ignores everything else", () => {
    for (const kind of ["CreatorJoined", "CharacterMinted", "QuestCreated", "QuestProposed", "JuryCaseOpened", "ProposalVoted", "TreasurySpent"] as const) {
      expect(overlayEvent(act({ kind }))).toBeNull();
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
