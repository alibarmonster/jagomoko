"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/money";
import { motionOff } from "@/lib/motion";
import type { Role } from "@/lib/roles";
import type { Battle, Quest } from "@/lib/data/types";
import { Avatar } from "@/components/ui/avatar";
import { Countdown } from "@/components/ui/countdown";
import { useNow } from "@/components/clock";

export type OverlayAnchor = "bottom-left" | "bottom-right" | "top-right";

/** Everything here is designed for a 1920×1080 canvas: body text 22px+, numbers 28px+. */
const panel = "rounded-md border border-bc-line bg-bc-panel text-bc-text backdrop-blur-md";

function QuestTracker({ quest }: { quest: Quest }) {
  const now = useNow(1000);
  const total = Math.max(1, quest.goalDeadline - quest.createdAt);
  const progress = Math.min(1, Math.max(0, (now - quest.createdAt) / total));
  return (
    <div className={cn(panel, "w-[540px] p-6")}>
      <p className="font-mono text-[18px] text-bc-muted">Quest · {quest.id.padStart(2, "0")}</p>
      <p className="mt-1 truncate text-[30px] font-medium leading-tight">{quest.title}</p>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="font-mono text-[30px] font-semibold tnum">{formatUsd(quest.pool)} backed</span>
        <Countdown endsAt={quest.goalDeadline} className="text-bc-text! text-[30px]" />
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bc-line" role="progressbar" aria-label="Time used" aria-valuenow={Math.round(progress * 100)}>
        <div className="h-full origin-left bg-bc-signal transition-transform duration-1000 ease-linear" style={{ transform: `scaleX(${progress})` }} />
      </div>
    </div>
  );
}

function BattleBar({ battle }: { battle: Battle }) {
  const total = battle.poolA + battle.poolB;
  const share = total === 0n ? 0.5 : Number((battle.poolA * 10_000n) / total) / 10_000;
  return (
    <div className={cn(panel, "w-[540px] p-6")}>
      <p className="font-mono text-[18px] text-bc-muted">Battle · {battle.id.padStart(2, "0")}</p>
      <p className="mt-1 truncate text-[28px] font-medium leading-tight">{battle.question}</p>
      <div className="mt-3 flex items-baseline justify-between text-[26px]">
        <span>
          {battle.sideA} <span className="font-mono font-semibold tnum">{battle.pointsMode ? "" : formatUsd(battle.poolA)}</span>
        </span>
        <span>
          <span className="font-mono font-semibold tnum">{battle.pointsMode ? "" : formatUsd(battle.poolB)}</span> {battle.sideB}
        </span>
      </div>
      <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-white/25" role="img" aria-label={`${Math.round(share * 100)}% on ${battle.sideA}`}>
        <div className="absolute inset-0 origin-left bg-bc-text transition-transform duration-(--dur-section) ease-in-out" style={{ transform: `scaleX(${share})` }} />
      </div>
      <p className="mt-3 flex items-baseline gap-2 text-[22px] text-bc-muted">
        picks close in <Countdown endsAt={battle.closeTime} className="text-bc-text! text-[24px]" />
      </p>
    </div>
  );
}

export interface AlertEvent {
  name: string;
  /** absent for someone who has no character yet */
  role?: Role;
  level?: number;
  text: string;
}

function Alert({ event, animate }: { event: AlertEvent; animate: boolean }) {
  return (
    <div className={cn(panel, "flex w-[540px] items-center gap-5 p-5 pr-7", animate && "animate-toast-in")}>
      <Avatar name={event.name} role={event.role} size={56} className="size-16 border-bc-line bg-white/10 text-bc-text" />
      <p className="text-[26px] leading-snug">
        {event.level !== undefined ? <span className="font-mono text-[22px] text-bc-signal tnum">Lv.{event.level} </span> : null}
        {event.role ? `${event.role} ` : null}
        <span className="font-semibold">{event.name}</span> {event.text}
      </p>
    </div>
  );
}

export interface OutcomeEvent {
  tone: "success" | "danger";
  text: string;
}

function OutcomeBanner({ outcome, animate }: { outcome: OutcomeEvent; animate: boolean }) {
  return (
    <div className={cn(panel, "flex w-[540px] items-center gap-4 p-5", animate && "animate-toast-in")} role="status">
      <span className={cn("size-3.5 rounded-full", outcome.tone === "success" ? "bg-success" : "bg-danger")} aria-hidden />
      <p className="text-[28px] font-medium">{outcome.text}</p>
    </div>
  );
}

const DEMO_ALERTS: AlertEvent[] = [
  { name: "Alice", role: "Knight", level: 7, text: "backed $10" },
  { name: "Hana", role: "Seer", level: 4, text: "picked Win with $20" },
  { name: "Gus", role: "Knight", level: 4, text: "backed $25" },
  { name: "Carol", role: "Judge", level: 6, text: "joined the jury" },
  { name: "Faye", role: "Bard", level: 4, text: "tipped $5" },
];

const DEMO_OUTCOMES: OutcomeEvent[] = [
  { tone: "success", text: "Quest complete" },
  { tone: "danger", text: "Quest failed: 90% refunded" },
];

/**
 * The broadcast overlay: persistent quest tracker + battle bar, event alerts
 * (one visible at a time, held 6s) and outcome banners (8s). Anchored to a
 * corner with a 48px safe area. `demo` cycles sample events so it can be
 * previewed without a live stream.
 *
 * With live data, live-overlay.tsx polls the realm and feeds `alert` and
 * `outcome` (dropping anything older than 30s instead of replaying a backlog).
 * All text is rendered as plain text from sanitized fields.
 */
export function OverlayStage({
  quest,
  battle,
  anchor = "bottom-left",
  demo = true,
  alert = null,
  outcome = null,
  className,
}: {
  quest: Quest | null;
  battle: Battle | null;
  anchor?: OverlayAnchor;
  /** cycle sample events, to preview without a live stream */
  demo?: boolean;
  /** the alert and banner to show when not in demo (the live overlay feeds these) */
  alert?: AlertEvent | null;
  outcome?: OutcomeEvent | null;
  className?: string;
}) {
  const [alertIdx, setAlertIdx] = React.useState<number | null>(demo ? 0 : null);
  const [outcomeIdx, setOutcomeIdx] = React.useState<number | null>(null);
  const [animate, setAnimate] = React.useState(false);

  React.useEffect(() => {
    setAnimate(!motionOff());
    if (!demo) return;
    let i = 0;
    let o = 0;
    let tick = 0;
    const id = window.setInterval(() => {
      tick += 1;
      // an alert every 8s, held 6s
      if (tick % 8 === 1) {
        setAlertIdx(i % DEMO_ALERTS.length);
        i += 1;
      } else if (tick % 8 === 7) {
        setAlertIdx(null);
      }
      // an outcome banner roughly every minute, held 8s
      if (tick % 60 === 30) {
        setOutcomeIdx(o % DEMO_OUTCOMES.length);
        o += 1;
      } else if (tick % 60 === 38) {
        setOutcomeIdx(null);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [demo]);

  const align =
    anchor === "bottom-left" ? "items-start justify-end" : anchor === "bottom-right" ? "items-end justify-end" : "items-end justify-start";

  return (
    <div className={cn("absolute inset-0 flex flex-col gap-4 p-12", align, className)}>
      {demo ? (
        <>
          {alertIdx !== null ? <Alert key={`a${alertIdx}`} event={DEMO_ALERTS[alertIdx]!} animate={animate} /> : null}
          {outcomeIdx !== null ? <OutcomeBanner key={`o${outcomeIdx}`} outcome={DEMO_OUTCOMES[outcomeIdx]!} animate={animate} /> : null}
        </>
      ) : (
        <>
          {alert ? <Alert key={`${alert.name}-${alert.text}`} event={alert} animate={animate} /> : null}
          {outcome ? <OutcomeBanner key={outcome.text} outcome={outcome} animate={animate} /> : null}
        </>
      )}
      {battle ? <BattleBar battle={battle} /> : null}
      {quest ? <QuestTracker quest={quest} /> : null}
    </div>
  );
}
