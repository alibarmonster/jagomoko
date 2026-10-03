"use client";

import * as React from "react";
import { useNow } from "@/components/clock";
import { formatRelative } from "@/lib/format";

/** "2m ago", kept fresh every 15s. Hydration-safe via the shared clock. */
export function RelativeTime({ at, className }: { at: number; className?: string }) {
  const now = useNow(15_000);
  return (
    <time dateTime={new Date(at).toISOString()} className={className} suppressHydrationWarning>
      {formatRelative(at, now)}
    </time>
  );
}
