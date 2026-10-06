import * as React from "react";
import { Ban, Check, CircleDot, Flag, Hourglass, Scale, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { MarketStatus, MarketType, ProposalStatus } from "@/lib/data/types";

export type Tone = "neutral" | "pending" | "success" | "danger" | "subtle";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink",
  pending: "text-pending",
  success: "text-success",
  danger: "text-danger",
  subtle: "text-subtle",
};

/**
 * Status is always text + icon (never color alone) and never a large fill.
 */
export function StatusPill({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface px-2 text-xs font-medium text-ink",
        className,
      )}
    >
      {Icon ? <Icon className={cn("size-3", TONE_TEXT[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}

const MARKET: Record<MarketType, Record<MarketStatus, { label: string; tone: Tone; icon: React.ComponentType<{ className?: string }> }>> = {
  Quest: {
    Open: { label: "Open", tone: "neutral", icon: CircleDot },
    Proposed: { label: "Challenge window", tone: "pending", icon: Hourglass },
    Disputed: { label: "Disputed", tone: "pending", icon: Scale },
    Succeeded: { label: "Complete", tone: "success", icon: Check },
    Failed: { label: "Failed", tone: "danger", icon: X },
    Invalid: { label: "Void", tone: "subtle", icon: Ban },
  },
  Battle: {
    Open: { label: "Open", tone: "neutral", icon: CircleDot },
    Proposed: { label: "Result reported", tone: "pending", icon: Flag },
    Disputed: { label: "Disputed", tone: "pending", icon: Scale },
    Succeeded: { label: "Resolved", tone: "success", icon: Check },
    Failed: { label: "Resolved", tone: "success", icon: Check },
    Invalid: { label: "Void", tone: "subtle", icon: Ban },
  },
};

export function MarketStatusPill({ type, status, className }: { type: MarketType; status: MarketStatus; className?: string }) {
  const m = MARKET[type][status];
  return (
    <StatusPill tone={m.tone} icon={m.icon} className={className}>
      {m.label}
    </StatusPill>
  );
}

const PROPOSAL: Record<ProposalStatus, { label: string; tone: Tone; icon: React.ComponentType<{ className?: string }> }> = {
  Active: { label: "Voting open", tone: "neutral", icon: CircleDot },
  Executed: { label: "Paid out", tone: "success", icon: Check },
  Defeated: { label: "Defeated", tone: "danger", icon: X },
  Vetoed: { label: "Vetoed", tone: "subtle", icon: Ban },
};

export function ProposalStatusPill({ status, className }: { status: ProposalStatus; className?: string }) {
  const m = PROPOSAL[status];
  return (
    <StatusPill tone={m.tone} icon={m.icon} className={className}>
      {m.label}
    </StatusPill>
  );
}

/** A live dot — the only perpetual animation in the product. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2", className)} aria-hidden>
      <span className="absolute inset-0 animate-live rounded-full bg-success" />
      <span className="relative size-2 rounded-full bg-success" />
    </span>
  );
}

/** Small mono label used for eyebrows and counters: "Quest · 01". */
export function MonoLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-2xs text-subtle", className)}>{children}</span>;
}

/** Decorative 01, 02, 03 marker (number-details): architectural, never competes with headings. */
export function Marker({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("font-mono text-2xs text-subtle tnum select-none", className)} aria-hidden>
      {String(n).padStart(2, "0")}
    </span>
  );
}
