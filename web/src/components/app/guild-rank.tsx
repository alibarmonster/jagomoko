import * as React from "react";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { GuildRank } from "@/lib/domain/guild";

const STYLE: Record<GuildRank, string> = {
  Recruit: "bg-sunken text-muted",
  Member: "border border-line-strong bg-surface text-ink",
  Veteran: "bg-signal-tint text-signal-ink",
  Jago: "bg-pending/15 text-ink",
};

/** A member's rank in a guild. The Jago (the top member) wears the crown. */
export function RankBadge({ rank, className }: { rank: GuildRank; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 font-mono text-2xs", STYLE[rank], className)}>
      {rank === "Jago" ? <Crown className="size-3 text-pending" aria-hidden /> : null}
      {rank}
    </span>
  );
}
