import * as React from "react";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/money";
import { EXPLORER, explorerTx } from "@/lib/chain/config";
import type { Activity, ActivityKind } from "@/lib/data/types";
import { Avatar } from "@/components/ui/avatar";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { RelativeTime } from "@/components/ui/relative-time";

/**
 * Rows whose sentence starts with whoever did it. The indexer leaves names out ("backed “Speedrun”"):
 * names are kept off chain, so the record only has a stand-in. The name goes in front here.
 */
const ACTOR_LED: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  "CharacterMinted",
  "QuestBacked",
  "BattleJoined",
  "ProposalVoted",
  "ClipSubmitted",
  "ClipVoted",
  "BountyWon",
]);

/** Amounts that are not dollars: a vote's weight (or, on a proposal, money already shown in its text). */
const NO_AMOUNT: ReadonlySet<ActivityKind> = new Set<ActivityKind>(["ProposalCreated", "ProposalVoted", "ClipVoted"]);

/**
 * One line of the live feed. The sentence comes from the indexer already
 * sanitized and is rendered strictly as text — never as HTML.
 */
export function ActivityRow({ item, className }: { item: Activity; className?: string }) {
  const name = item.actorName ?? "A viewer";
  const isTip = item.kind === "Tip";
  // rows indexed before names moved off chain still start with the name
  const startsWithName = item.text.startsWith(name);
  const actorLed = ACTOR_LED.has(item.kind) && !startsWithName;
  const showAmount = item.amount > 0n && !NO_AMOUNT.has(item.kind);

  return (
    <li className={cn("flex items-start gap-3 py-3", className)}>
      <Avatar name={name} seed={item.actor} role={item.actorRole} size={24} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">
          {isTip ? (
            <>
              <span className="font-medium text-ink">{name}</span> tipped{" "}
              <span className="font-mono text-ink tnum">{formatUsd(item.amount)}</span>
            </>
          ) : actorLed ? (
            <>
              <span className="font-medium text-ink">{name}</span> {item.text}
            </>
          ) : startsWithName ? (
            <>
              <span className="font-medium text-ink">{name}</span>
              {item.text.slice(name.length)}
            </>
          ) : (
            item.text
          )}
        </p>
        {isTip && item.text ? <p className="mt-0.5 line-clamp-2 text-sm text-subtle">&ldquo;{item.text}&rdquo;</p> : null}
        <p className="mt-0.5 flex items-center gap-2 font-mono text-2xs text-subtle">
          {item.actorLevel ? <span className="tnum">Lv.{item.actorLevel}</span> : null}
          <RelativeTime at={item.timestamp} />
          {/* an anonymous tip's transaction would show who sent it */}
          {item.txHash && !item.anonymous ? (
            <ExplorerLink href={explorerTx(item.txHash)} className="decoration-transparent hover:decoration-line-strong">
              {EXPLORER.name}
            </ExplorerLink>
          ) : null}
        </p>
      </div>
      {showAmount && !isTip ? (
        <span className="mt-0.5 shrink-0 rounded-xs bg-sunken px-1.5 py-0.5 font-mono text-2xs text-ink tnum">{formatUsd(item.amount)}</span>
      ) : null}
    </li>
  );
}

export function ActivityFeed({ items, className, empty }: { items: Activity[]; className?: string; empty?: React.ReactNode }) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul className={cn("divide-y divide-line", className)} aria-label="Live activity">
      {items.map((a) => (
        <ActivityRow key={a.id} item={a} />
      ))}
    </ul>
  );
}
