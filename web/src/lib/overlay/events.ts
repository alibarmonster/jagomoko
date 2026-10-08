import { formatUsd, type Usd } from "../utils/money";
import { sourceByEid } from "../chain/config";
import type { Activity } from "../data/types";
import { forExperience } from "../experience";
import type { TestKind } from "./test-alerts";
import type { AlertEvent, OutcomeEvent } from "../../components/overlay/overlay-stage";

/** An overlay event is either a small alert (someone did something) or an outcome banner. */
export interface OverlayEvent {
  id: string;
  alert?: AlertEvent;
  outcome?: OutcomeEvent;
}

/** Events older than this are never shown: opening the overlay must not replay a backlog. */
export const MAX_EVENT_AGE_MS = 30_000;

/**
 * How big a moment is on stream, by the money in it. Delight scales with the amount: a small tip
 * gets a peek, a solid one a cheer, a big one the party (confetti and a violet frame).
 */
export type AlertTier = "peek" | "cheer" | "party";

const USD = 1_000_000n;

export function alertTier(amount: Usd): AlertTier {
  if (amount >= 25n * USD) return "party";
  if (amount >= 5n * USD) return "cheer";
  return "peek";
}

/** How long each alert stays up. The party gets a few more seconds to land. */
export const ALERT_HOLD_MS: Record<AlertTier, number> = { peek: 6_000, cheer: 6_000, party: 9_000 };

/**
 * What the overlay knows: who the guild's Jago is, so their alerts wear the crown, and whether the
 * streamer runs it in web3 (the OBS URL's ?mode=web3), which names the chain a tip came from. In
 * web2, the default, a tip from another chain reads like any tip (lib/experience.ts).
 */
export type OverlayContext = { jago?: string; web3?: boolean };

function alert(a: Activity, text: string, tier: AlertTier, ctx: OverlayContext, extra: Pick<AlertEvent, "lead" | "message"> = {}): OverlayEvent {
  const anonymous = a.anonymous === true;
  return {
    id: a.id,
    alert: {
      name: a.actorName ?? "A viewer",
      role: a.actorRole,
      level: a.actorLevel,
      text,
      tier,
      // an anonymous tip, or someone without a character yet: Moko stands in for them
      moko: anonymous || !a.actorRole,
      jago: !anonymous && !!ctx.jago && a.actor.toLowerCase() === ctx.jago.toLowerCase(),
      ...extra,
    },
  };
}

/** Turns one indexed activity into something worth showing on stream, or null when it is not. */
export function overlayEvent(raw: Activity, ctx: OverlayContext = {}): OverlayEvent | null {
  const a = forExperience(raw, ctx.web3 ? "web3" : "web2");
  switch (a.kind) {
    case "Tip":
      return alert(a, `tipped ${formatUsd(a.amount)}`, alertTier(a.amount), ctx, {
        // paid on another chain and carried over by LayerZero
        lead: a.via === undefined ? undefined : `From ${sourceByEid(a.via)?.short ?? "another chain"} · via LayerZero`,
        // what the tipper wrote, already cleaned by the indexer
        message: a.text || undefined,
      });
    case "QuestBacked":
      return alert(a, `backed ${formatUsd(a.amount)}`, alertTier(a.amount), ctx);
    case "BattleJoined":
      return alert(a, a.amount > 0n ? `picked a side with ${formatUsd(a.amount)}` : "picked a side", alertTier(a.amount), ctx);
    case "BountyWon":
      // the link never goes on stream: just who won
      return alert(a, a.amount > 0n ? `won the clip bounty (${formatUsd(a.amount)})` : "won the clip bounty", "party", ctx);
    case "QuestResolved":
    case "BattleResolved":
      // the indexer words these for viewers already ("Quest complete", "Battle voided: stakes refunded")
      return { id: a.id, outcome: { tone: /fail|void|refund/i.test(a.text) ? "danger" : "success", text: a.text } };
    default:
      return null;
  }
}

/**
 * A sample alert for the studio's "send a test" button, built like a real one so it looks exactly
 * the same on stream. The content is fixed; nothing a request says ever reaches the screen.
 */
export function testOverlayEvent(kind: TestKind, id: string, ctx: OverlayContext = {}): OverlayEvent {
  const sample = (over: Partial<Activity>): Activity => ({
    id,
    creatorId: "",
    actor: "",
    actorName: "Test viewer",
    actorRole: "Knight",
    actorLevel: 7,
    kind: "Tip",
    amount: 5n * USD,
    refId: "",
    text: "",
    timestamp: Date.now(),
    ...over,
  });
  const make = (a: Activity) => overlayEvent(a, ctx) ?? { id };
  switch (kind) {
    case "tip":
      return make(sample({ kind: "Tip", text: "Let's go!" }));
    case "anonymous":
      return make(sample({ kind: "Tip", actorName: "Anonymous", actorRole: undefined, actorLevel: undefined, anonymous: true }));
    case "party":
      return make(sample({ kind: "Tip", amount: 25n * USD }));
    case "crosschain":
      return make(sample({ kind: "Tip", actorName: "0x3f2a…91c4", actorRole: undefined, actorLevel: undefined, via: 40161, amount: 10n * USD, text: "gg from Sepolia" }));
    case "quest":
      return make(sample({ kind: "QuestBacked", amount: 10n * USD }));
    case "battle":
      return make(sample({ kind: "BattleJoined", amount: 20n * USD }));
    case "clip":
      return make(sample({ kind: "BountyWon", actorName: "Test Bard", actorRole: "Bard", actorLevel: 4, amount: 20n * USD }));
    case "result":
      return make(sample({ kind: "QuestResolved", amount: 0n, text: "Quest complete" }));
  }
}

/**
 * The events to show from a fresh read of a guild's activity. `seen` holds what was already shown
 * (or was already there when the overlay opened); it is updated in place. Oldest first, and only
 * events from the last 30 seconds.
 */
export function newOverlayEvents(activity: Activity[], seen: Set<string>, now: number, ctx: OverlayContext = {}): OverlayEvent[] {
  const fresh: OverlayEvent[] = [];
  for (const a of [...activity].sort((x, y) => x.timestamp - y.timestamp)) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    if (now - a.timestamp > MAX_EVENT_AGE_MS) continue;
    const e = overlayEvent(a, ctx);
    if (e) fresh.push(e);
  }
  return fresh;
}
