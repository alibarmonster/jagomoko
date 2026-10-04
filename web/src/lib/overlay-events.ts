import { formatUsd } from "./money";
import type { Activity } from "./data/types";
import type { AlertEvent, OutcomeEvent } from "../components/overlay/overlay-stage";

/** An overlay event is either a small alert (someone did something) or an outcome banner. */
export interface OverlayEvent {
  id: string;
  alert?: AlertEvent;
  outcome?: OutcomeEvent;
}

/** Events older than this are never shown: opening the overlay must not replay a backlog. */
export const MAX_EVENT_AGE_MS = 30_000;

function alert(a: Activity, text: string): OverlayEvent {
  return { id: a.id, alert: { name: a.actorName ?? "A viewer", role: a.actorRole, level: a.actorLevel, text } };
}

/** Turns one indexed activity into something worth showing on stream, or null when it is not. */
export function overlayEvent(a: Activity): OverlayEvent | null {
  switch (a.kind) {
    case "Tip":
      return alert(a, `tipped ${formatUsd(a.amount)}`);
    case "QuestBacked":
      return alert(a, `backed ${formatUsd(a.amount)}`);
    case "BattleJoined":
      return alert(a, a.amount > 0n ? `picked a side with ${formatUsd(a.amount)}` : "picked a side");
    case "QuestResolved":
    case "BattleResolved":
      // the indexer words these for viewers already ("Quest complete", "Battle voided: stakes refunded")
      return { id: a.id, outcome: { tone: /fail|void|refund/i.test(a.text) ? "danger" : "success", text: a.text } };
    default:
      return null;
  }
}

/**
 * The events to show from a fresh read of a realm's activity. `seen` holds what was already shown
 * (or was already there when the overlay opened); it is updated in place. Oldest first, and only
 * events from the last 30 seconds.
 */
export function newOverlayEvents(activity: Activity[], seen: Set<string>, now: number): OverlayEvent[] {
  const fresh: OverlayEvent[] = [];
  for (const a of [...activity].sort((x, y) => x.timestamp - y.timestamp)) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    if (now - a.timestamp > MAX_EVENT_AGE_MS) continue;
    const e = overlayEvent(a);
    if (e) fresh.push(e);
  }
  return fresh;
}
