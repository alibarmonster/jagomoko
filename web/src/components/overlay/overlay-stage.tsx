"use client";

import * as React from "react";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { MascotName } from "@/lib/domain/mascots";
import type { AlertTier } from "@/lib/overlay/events";
import { formatUsd } from "@/lib/utils/money";
import { motionOff } from "@/lib/utils/motion";
import type { Role } from "@/lib/domain/roles";
import type { Battle, Quest } from "@/lib/data/types";
import { TIP_SOURCES } from "@/lib/chain/config";
import { Avatar } from "@/components/ui/avatar";
import { Confetti } from "@/components/ui/confetti";
import { Countdown } from "@/components/ui/countdown";
import { Mascot, mascotFor } from "@/components/ui/mascot";
import { QrCode } from "@/components/ui/qr-code";
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

/**
 * A QR to the guild's tip page, for viewers watching on another screen. In web2 it is an everyday
 * tip with an email; in web3 it says the page also takes ETH from another chain (contract v2).
 */
function TipQr({ url, web3 }: { url: string; web3: boolean }) {
  const shown = url.replace(/^https?:\/\//, "");
  return (
    <div className={cn(panel, "flex w-[540px] items-center gap-5 p-5")}>
      <QrCode value={url} size={150} label={`Scan to tip: ${shown}`} className="shrink-0 rounded-sm" />
      <div className="min-w-0">
        <p className="font-mono text-[18px] text-bc-muted">{web3 ? "Tip from any chain" : "Tip from your phone"}</p>
        <p className="mt-1 text-[28px] font-medium leading-tight">{web3 ? "Scan to tip with ETH" : "Scan to tip"}</p>
        <p className="mt-1 font-mono text-[18px] text-bc-muted">
          {web3 ? `from ${TIP_SOURCES[0]?.short ?? "another chain"}, no account needed` : "sign in with email, no app needed"}
        </p>
        <p className="mt-2 truncate font-mono text-[18px] text-bc-signal">{shown}</p>
      </div>
    </div>
  );
}

export interface AlertEvent {
  name: string;
  /** absent for someone who has no character yet */
  role?: Role;
  level?: number;
  text: string;
  /** a small line above, e.g. where a tip from another chain came from */
  lead?: string;
  /** what a tipper wrote with their tip (already cleaned by the indexer; plain text only) */
  message?: string;
  /** how big the moment is (lib/overlay/events alertTier); a peek when absent */
  tier?: AlertTier;
  /** an anonymous tip or someone without a character: Moko stands in for them */
  moko?: boolean;
  /** the guild's Jago (its top member) wears the crown */
  jago?: boolean;
}

/** The character that pops up with an alert: theirs, or Moko for anyone without one (and every anonymous tip). */
function alertMascot(e: AlertEvent): { name: MascotName; peek: boolean } {
  const tier = e.tier ?? "peek";
  if (e.moko || !e.role) return { name: tier === "party" ? "moko-party" : tier === "cheer" ? "moko-wow" : "moko-hello", peek: false };
  return tier === "peek" ? { name: mascotFor(e.role, "peek"), peek: true } : { name: mascotFor(e.role, "cheer"), peek: false };
}

function Alert({ event, animate }: { event: AlertEvent; animate: boolean }) {
  const tier = event.tier ?? "peek";
  const mascot = alertMascot(event);
  // a peek grips the top edge of the panel; everyone else stands on it
  const height = mascot.peek ? 116 : tier === "party" ? 200 : tier === "cheer" ? 168 : 132;
  return (
    <div className="relative w-[540px]">
      {tier === "party" && animate ? <Confetti className="-inset-x-24 -top-56 bottom-6" /> : null}
      {tier === "cheer" && animate ? <Confetti className="-inset-x-6 -top-32 bottom-10" count={10} /> : null}
      <Mascot
        name={mascot.name}
        height={height}
        eager
        className={cn("absolute right-8 z-10", mascot.peek ? "bottom-full -mb-3" : "bottom-[calc(100%-26px)]", animate && "animate-alert-pop")}
      />
      <div
        className={cn(
          panel,
          "relative flex items-center gap-5 p-5 pr-7",
          tier === "party" && "border-[3px] border-bc-signal shadow-[0_0_56px_rgb(124_92_255/0.55)]",
          animate && "animate-toast-in",
        )}
      >
        <Avatar name={event.name} role={event.role} size={56} className="size-16 shrink-0 border-bc-line bg-white/10 text-bc-text" />
        <div className="min-w-0">
          {event.lead ? <p className="font-mono text-[18px] text-bc-signal">{event.lead}</p> : null}
          <p className="text-[26px] leading-snug">
            {event.jago ? <Crown className="mr-1.5 inline size-7 -translate-y-0.5 text-pending" aria-label="Jago" /> : null}
            {event.level !== undefined ? <span className="font-mono text-[22px] text-bc-signal tnum">Lv.{event.level} </span> : null}
            {event.role ? `${event.role} ` : null}
            <span className="font-semibold">{event.name}</span> {event.text}
          </p>
          {event.message ? <p className="mt-1 line-clamp-2 break-words text-[22px] leading-snug text-bc-muted">&ldquo;{event.message}&rdquo;</p> : null}
        </div>
      </div>
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
      <Mascot name={outcome.tone === "success" ? "knight-cheer" : "knight-oops"} height={84} eager className={cn("-my-5 shrink-0", animate && "animate-alert-pop")} />
      <p className="text-[28px] font-medium">{outcome.text}</p>
    </div>
  );
}

const DEMO_ALERTS: AlertEvent[] = [
  { name: "Alice", role: "Knight", level: 7, text: "backed $10", tier: "cheer", jago: true },
  { name: "Anonymous", text: "tipped $2", tier: "peek", moko: true },
  { name: "Rina", role: "Bard", level: 3, text: "tipped $5", message: "that clutch was unreal", tier: "cheer" },
  // web3 only: a tip from another chain names where it came from
  { name: "0x3f2a…91c4", text: "tipped $10", lead: "From Sepolia · via LayerZero", message: "gg from Sepolia", tier: "cheer", moko: true },
  { name: "Gus", role: "Knight", level: 4, text: "backed $25", tier: "party" },
  { name: "Hana", role: "Seer", level: 4, text: "picked a side with $3", tier: "peek" },
  { name: "Faye", role: "Bard", level: 4, text: "won the clip bounty ($20)", tier: "party" },
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
  tipQr,
  web3 = false,
  className,
}: {
  quest: Quest | null;
  battle: Battle | null;
  /** the streamer runs the overlay in web3 (?mode=web3): chains are named, the QR offers ETH */
  web3?: boolean;
  /** the guild's tip page: shows a QR for tips from other chains */
  tipQr?: string;
  anchor?: OverlayAnchor;
  /** cycle sample events, to preview without a live stream */
  demo?: boolean;
  /** the alert and banner to show when not in demo (the live overlay feeds these) */
  alert?: AlertEvent | null;
  outcome?: OutcomeEvent | null;
  className?: string;
}) {
  // web2 previews leave out the alert that names another chain
  const demoAlerts = React.useMemo(() => (web3 ? DEMO_ALERTS : DEMO_ALERTS.filter((a) => !a.lead)), [web3]);
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
        setAlertIdx(i % demoAlerts.length);
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
  }, [demo, demoAlerts]);

  const align =
    anchor === "bottom-left" ? "items-start justify-end" : anchor === "bottom-right" ? "items-end justify-end" : "items-end justify-start";

  return (
    <div className={cn("absolute inset-0 flex flex-col gap-4 p-12", align, className)}>
      {demo ? (
        <>
          {alertIdx !== null && demoAlerts[alertIdx] ? <Alert key={`a${alertIdx}`} event={demoAlerts[alertIdx]} animate={animate} /> : null}
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
      {tipQr ? <TipQr url={tipQr} web3={web3} /> : null}
    </div>
  );
}
