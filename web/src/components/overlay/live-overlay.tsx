"use client";

import * as React from "react";
import { fetchRealmClient } from "@/lib/data/client";
import type { World } from "@/lib/data/types";
import { ALERT_HOLD_MS, newOverlayEvents, testOverlayEvent } from "@/lib/overlay-events";
import { readOverlayTests } from "@/lib/overlay-client";
import { OverlayStage, type AlertEvent, type OutcomeEvent, type OverlayAnchor } from "./overlay-stage";

const OUTCOME_MS = 8_000;

/**
 * The OBS overlay on real data. It reads the guild every 2 seconds and shows each new tip, backing,
 * pick and clip win as an alert (one at a time: 6 seconds, 9 for a party) and each result as a
 * banner (8 seconds). What was already there when it opened is never replayed. A failed read keeps
 * the last picture on screen.
 */
export function LiveOverlay({ handle, anchor, testKey, tipQr }: { handle: string; anchor: OverlayAnchor; testKey?: string; tipQr?: string }) {
  const [world, setWorld] = React.useState<World | null>(null);
  const [alert, setAlert] = React.useState<AlertEvent | null>(null);
  const [outcome, setOutcome] = React.useState<OutcomeEvent | null>(null);

  const seen = React.useRef<Set<string> | null>(null); // null until the first read, which only marks history as seen
  const alerts = React.useRef<AlertEvent[]>([]);
  const outcomes = React.useRef<OutcomeEvent[]>([]);
  const alertUntil = React.useRef(0);
  const outcomeUntil = React.useRef(0);

  React.useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const result = await fetchRealmClient(handle);
      if (cancelled || !("world" in result)) return;
      const w = result.world;
      setWorld(w);
      if (seen.current === null) {
        seen.current = new Set(w.activity.map((a) => a.id));
        return;
      }
      // the guild's Jago wears the crown on stream
      const jago = w.guild.jagoId ? w.guild.members.find((m) => m.id === w.guild.jagoId)?.player.id : undefined;
      for (const e of newOverlayEvents(w.activity, seen.current, Date.now(), { jago })) {
        if (e.alert) alerts.current.push(e.alert);
        if (e.outcome) outcomes.current.push(e.outcome);
      }
    };
    void read();
    const poll = window.setInterval(() => void read(), 2_000);

    // test alerts sent from the studio to an overlay that has this key. The first read only finds
    // the cursor, so a test pressed before this page opened is never replayed.
    let cursor: number | null = null;
    let tests = 0;
    const readTests = async () => {
      if (!testKey) return;
      const result = await readOverlayTests(testKey, cursor ?? undefined);
      if (cancelled || !result) return;
      const first = cursor === null;
      cursor = result.cursor;
      if (first) return;
      for (const kind of result.kinds) {
        const e = testOverlayEvent(kind, `test-${++tests}`);
        if (e.alert) alerts.current.push(e.alert);
        if (e.outcome) outcomes.current.push(e.outcome);
      }
    };
    void readTests();
    const pollTests = testKey ? window.setInterval(() => void readTests(), 2_000) : undefined;

    // one alert and one banner at a time, each held for its time, then the next in line
    const show = window.setInterval(() => {
      const now = Date.now();
      if (now >= alertUntil.current) {
        const next = alerts.current.shift();
        alertUntil.current = next ? now + ALERT_HOLD_MS[next.tier ?? "peek"] : 0;
        setAlert(next ?? null);
      }
      if (now >= outcomeUntil.current) {
        const next = outcomes.current.shift();
        outcomeUntil.current = next ? now + OUTCOME_MS : 0;
        setOutcome(next ?? null);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      if (pollTests !== undefined) window.clearInterval(pollTests);
      window.clearInterval(show);
    };
  }, [handle, testKey]);

  const quest = world?.quests.find((q) => q.status === "Open") ?? null;
  const battle = world?.battles.find((b) => b.status === "Open" && !b.pointsMode) ?? null;
  return <OverlayStage quest={quest} battle={battle} anchor={anchor} demo={false} alert={alert} outcome={outcome} tipQr={tipQr} />;
}
