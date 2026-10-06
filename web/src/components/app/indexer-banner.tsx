"use client";

import * as React from "react";
import { CloudOff, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SAMPLE_DATA } from "@/lib/config";
import { behindText, type IndexerStatus } from "@/lib/data/status";

type Health = { kind: "ok" } | { kind: "behind"; seconds: number | null } | { kind: "down" };

/**
 * Says so when the live numbers (the indexer) fall minutes behind the chain or can't be reached.
 * Without it a tip that went through looks like it vanished: the chain has it, the screen doesn't.
 * Checks every 15 s while the tab is visible. Hidden in sample mode.
 */
export function IndexerBanner({ className }: { className?: string }) {
  const [health, setHealth] = React.useState<Health>({ kind: "ok" });

  React.useEffect(() => {
    if (SAMPLE_DATA) return;
    let cancelled = false;
    let failures = 0;

    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/indexer/status", { cache: "no-store" });
        if (res.status === 429) return; // slowed down: keep what we know
        if (!res.ok) throw new Error(String(res.status));
        const status = (await res.json()) as IndexerStatus;
        failures = 0;
        if (!cancelled) setHealth(status.stalled ? { kind: "behind", seconds: status.behindSeconds } : { kind: "ok" });
      } catch {
        failures += 1;
        if (!cancelled && failures >= 2) setHealth({ kind: "down" }); // one blip is not an outage
      }
    }

    void check();
    const timer = window.setInterval(check, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (health.kind === "ok") return null;
  const Icon = health.kind === "down" ? CloudOff : Hourglass;
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-md border border-pending/25 bg-pending/5 px-4 py-3", className)}>
      <Icon className="mt-0.5 size-4 shrink-0 text-pending" aria-hidden />
      <div className="text-sm">
        <p className="font-medium text-ink">{health.kind === "down" ? "Live numbers aren’t reachable right now" : "Live numbers are paused"}</p>
        <p className="mt-0.5 text-muted">
          {health.kind === "behind" && health.seconds !== null ? <>They&rsquo;re about {behindText(health.seconds)} behind the chain. </> : null}
          Everything you do still goes through on chain, and shows up here once they catch up.
        </p>
      </div>
    </div>
  );
}
