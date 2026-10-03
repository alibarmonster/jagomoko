"use client";

import * as React from "react";
import { useNow } from "@/components/clock";
import { cn } from "@/lib/cn";
import { formatClock } from "@/lib/format";

/**
 * Mono, tabular countdown. Turns "pending" under 60 seconds. The visual timer
 * is silent; a hidden live region announces at minute granularity only.
 * `frozen` renders a fixed value (labelled marketing samples never tick).
 */
export function Countdown({
  endsAt,
  frozen,
  endedLabel = "Ended",
  className,
}: {
  endsAt?: number;
  frozen?: number;
  endedLabel?: string;
  className?: string;
}) {
  const now = useNow(1000);
  const remaining = frozen !== undefined ? frozen : Math.max(0, Math.ceil(((endsAt ?? 0) - now) / 1000));

  if (frozen === undefined && remaining <= 0) {
    return <span className={cn("font-mono text-xs text-subtle", className)}>{endedLabel}</span>;
  }

  const minutes = Math.ceil(remaining / 60);
  return (
    <span
      role={frozen === undefined ? "timer" : undefined}
      className={cn(
        "inline-flex items-center font-mono text-xs tnum",
        remaining < 60 ? "text-pending" : "text-muted",
        className,
      )}
    >
      <span aria-hidden>{formatClock(remaining)}</span>
      {frozen === undefined ? (
        <span className="sr-only" aria-live="polite">
          {minutes} {minutes === 1 ? "minute" : "minutes"} left
        </span>
      ) : (
        <span className="sr-only">{formatClock(remaining)} left</span>
      )}
    </span>
  );
}
