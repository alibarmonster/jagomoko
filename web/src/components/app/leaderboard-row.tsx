import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/ui/avatar";
import type { Role } from "@/lib/domain/roles";

/**
 * Rank in mono (01–03 in ink, the rest subtle — no gold/silver/bronze), avatar,
 * name, level, and one right-aligned metric. `you` pins the viewer's own row.
 */
export function LeaderboardRow({
  rank,
  name,
  seed,
  role,
  level,
  metric,
  metricLabel,
  you = false,
  className,
}: {
  rank: number;
  name: string;
  seed?: string;
  role?: Role;
  level?: number;
  metric: React.ReactNode;
  metricLabel?: string;
  you?: boolean;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-1 py-3 sm:grid-cols-[2.5rem_1fr_auto_auto] sm:gap-4",
        you && "rounded-md bg-signal-tint px-3",
        className,
      )}
      aria-current={you ? "true" : undefined}
    >
      <span className={cn("font-mono text-sm tnum", rank <= 3 ? "text-ink" : "text-subtle")}>{String(rank).padStart(2, "0")}</span>
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={name} seed={seed} role={role} size={32} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">
            {name}
            {you ? <span className="ml-2 font-mono text-2xs font-normal text-signal-ink">you</span> : null}
          </span>
          {role ? <span className="block font-mono text-2xs text-subtle">{role}</span> : null}
        </span>
      </span>
      {level !== undefined ? (
        <span className="hidden font-mono text-xs text-subtle tnum sm:block">Lv.{level}</span>
      ) : (
        <span className="hidden sm:block" />
      )}
      <span className="text-right">
        <span className="block font-mono text-sm text-ink tnum">{metric}</span>
        {metricLabel ? <span className="block text-2xs text-subtle">{metricLabel}</span> : null}
      </span>
    </li>
  );
}
