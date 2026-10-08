"use client";

import * as React from "react";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatUsd } from "@/lib/utils/money";
import { battleEstimate } from "@/lib/domain/outcomes";
import { proofDomain } from "@/lib/utils/format";
import { safeUrl } from "@/lib/utils/sanitize";
import { routes } from "@/lib/routing/routes";
import type { Battle } from "@/lib/data/types";
import { Button, ButtonLink } from "@/components/ui/button";
import { Countdown } from "@/components/ui/countdown";
import { TugBar } from "@/components/ui/progress";
import { MarketStatusPill, MonoLabel, StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { useNow } from "@/components/clock";
import { LAYER_LOCAL } from "@/lib/config";
import { useSession } from "@/components/session";
import { usePending } from "@/hooks/use-pending";
import { viewTx } from "@/lib/chain/explorer";
import { PickSideSheet } from "./pick-side-sheet";
import { useIsGuildOperator } from "./guild-operators";

/**
 * Viewer-vs-viewer prediction. Two equal side buttons, a tug bar that shows the
 * pools moving, and an estimate that says it is an estimate.
 */
export function BattleCard({
  battle,
  sample = false,
  locked: lockedProp = false,
  frozenSeconds,
  className,
}: {
  battle: Battle;
  sample?: boolean;
  /** Creator / mods can never play their own battle */
  locked?: boolean;
  frozenSeconds?: number;
  className?: string;
}) {
  const session = useSession();
  // the guild's streamer and moderators report the result, so the contract keeps them out
  const operator = useIsGuildOperator();
  const locked = lockedProp || operator;
  const { push } = useToast();
  const { pending, run } = usePending();
  const now = useNow(1000);
  const [pickOpen, setPickOpen] = React.useState(false);
  const [side, setSide] = React.useState<0 | 1>(0);

  const mine = sample ? undefined : session.state.picks[battle.id];
  const picksOpen = battle.status === "Open" && (frozenSeconds !== undefined || battle.closeTime > now);
  const labels = [battle.sideA, battle.sideB] as const;

  // my pick is included in the displayed pools / counts
  const poolA = battle.poolA + (LAYER_LOCAL && mine?.side === 0 ? mine.amount : 0n);
  const poolB = battle.poolB + (LAYER_LOCAL && mine?.side === 1 ? mine.amount : 0n);
  const playersA = battle.playersA + (LAYER_LOCAL && mine?.side === 0 ? 1 : 0);
  const playersB = battle.playersB + (LAYER_LOCAL && mine?.side === 1 ? 1 : 0);

  const resolved = battle.status === "Succeeded" || battle.status === "Failed" || battle.status === "Invalid";
  const winner: 0 | 1 | null = battle.status === "Succeeded" ? 0 : battle.status === "Failed" ? 1 : null;
  const claimKey = `b${battle.id}`;
  const claimed = !sample && !!session.state.claimed[claimKey];
  const proof = battle.proofUrl ? safeUrl(battle.proofUrl) : undefined;
  const domain = proofDomain(proof);

  let payout = 0n;
  if (resolved && mine) {
    if (battle.refundAll || battle.status === "Invalid") payout = mine.amount;
    else if (winner !== null && mine.side === winner && !battle.pointsMode) {
      const winnerPool = winner === 0 ? battle.poolA : battle.poolB;
      payout = mine.amount + (winnerPool > 0n ? (battle.winnings * mine.amount) / winnerPool : 0n);
    }
  }
  const estimate = mine && picksOpen && !battle.pointsMode ? battleEstimate(mine.amount, mine.side, [poolA - (mine.side === 0 ? mine.amount : 0n), poolB - (mine.side === 1 ? mine.amount : 0n)]) : null;

  function choose(s: 0 | 1) {
    setSide(s);
    setPickOpen(true);
  }

  return (
    <article className={cn("rounded-md border border-line bg-surface p-4", className)} aria-label={`Battle: ${battle.question}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MonoLabel>Battle · {battle.id.padStart(2, "0")}</MonoLabel>
        <MarketStatusPill type="Battle" status={battle.status} />
        {battle.pointsMode ? <StatusPill>XP only</StatusPill> : null}
        <span className="ml-auto text-xs text-subtle">
          {picksOpen ? (
            <span className="inline-flex items-baseline gap-1.5">
              <span>picks close in</span>
              <Countdown endsAt={battle.closeTime} frozen={frozenSeconds} />
            </span>
          ) : battle.status === "Open" ? (
            <span>Picks closed</span>
          ) : null}
        </span>
      </header>

      <h3 className="mt-3 line-clamp-2 text-lg text-ink">{battle.question}</h3>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {([0, 1] as const).map((s) => {
          const picked = mine?.side === s;
          const won = winner === s;
          const pool = s === 0 ? poolA : poolB;
          const players = s === 0 ? playersA : playersB;
          const disabled = locked || !picksOpen || (mine !== undefined && mine.side !== s);
          return (
            <button
              key={s}
              type="button"
              disabled={disabled && !picked}
              aria-disabled={disabled}
              aria-pressed={picked}
              onClick={() => (disabled ? undefined : choose(s))}
              className={cn(
                "rounded-md border p-3 text-left transition duration-(--dur-micro) ease-out",
                picked || won ? "border-signal bg-signal-tint" : "border-line-strong bg-surface",
                !disabled && "hover:bg-sunken",
                disabled && !picked && "opacity-70",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{labels[s]}</span>
                {picked ? <Check className="size-3.5 text-signal" aria-label="Your pick" /> : won ? <Check className="size-3.5 text-success" aria-label="Won" /> : null}
              </span>
              <span className="mt-1 block font-mono text-base text-ink tnum">{battle.pointsMode ? "—" : formatUsd(pool)}</span>
              <span className="mt-0.5 block text-xs text-subtle">
                <span className="font-mono tnum">{players}</span> {players === 1 ? "player" : "players"}
              </span>
            </button>
          );
        })}
      </div>

      {!battle.pointsMode ? <TugBar pools={[poolA, poolB]} className="mt-3" /> : null}

      <div className="mt-3 text-xs text-subtle">
        {locked ? (
          <p className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden /> You run this guild, so you can&rsquo;t pick a side.
          </p>
        ) : estimate && mine ? (
          <p>
            You picked <span className="font-medium text-ink">{labels[mine.side]}</span> with{" "}
            <span className="font-mono tnum">{formatUsd(mine.amount)}</span>. If it wins you get about{" "}
            <span className="font-mono text-ink tnum">{formatUsd(estimate.payout, { cents: "always" })}</span>{" "}
            <span>(estimate, changes as others join).</span>
          </p>
        ) : mine && battle.pointsMode && picksOpen ? (
          <p>
            You picked <span className="font-medium text-ink">{labels[mine.side]}</span>. XP is awarded when the result is in.
          </p>
        ) : resolved ? (
          <p>
            {battle.status === "Invalid" || battle.refundAll
              ? "Void — stakes are refunded."
              : `${winner === 0 ? battle.sideA : battle.sideB} won.`}{" "}
            {domain && proof ? (
              <a
                href={proof}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline decoration-line-strong underline-offset-2 hover:text-ink"
              >
                Proof: {domain}
              </a>
            ) : null}
          </p>
        ) : battle.status === "Proposed" ? (
          <p>Result reported. Players can dispute until the window ends.</p>
        ) : battle.status === "Disputed" ? (
          <p>A jury is deciding.</p>
        ) : null}
      </div>

      {resolved && mine && !claimed ? (
        payout > 0n || (battle.pointsMode && winner === mine.side) ? (
          <Button
            variant="signal"
            className="mt-3 w-full"
            loading={pending}
            onClick={() =>
              run(async () => {
                const r = await session.actions.claim(claimKey, payout);
                if (!r.ok) {
                  push({ tone: "danger", title: "Couldn’t claim", description: r.error });
                  return;
                }
                push({
                  tone: "success",
                  title: payout > 0n ? `${formatUsd(payout, { cents: "always" })} is in your account` : "Winnings claimed",
                  action: viewTx(r.tx),
                });
              })
            }
          >
            {payout > 0n ? `Claim ${formatUsd(payout, { cents: "always" })}` : "Claim your XP"}
          </Button>
        ) : (
          <p className="mt-3 text-xs text-subtle">Your side didn&rsquo;t win this one.</p>
        )
      ) : null}
      {resolved && mine && claimed ? <p className="mt-3 text-xs text-subtle">Claimed.</p> : null}
      {battle.status === "Disputed" ? (
        <ButtonLink href={routes.jury} variant="secondary" size="sm" className="mt-3 w-full">
          See the jury
        </ButtonLink>
      ) : null}

      {!sample ? <PickSideSheet battle={battle} initialSide={side} open={pickOpen} onOpenChange={setPickOpen} /> : null}
    </article>
  );
}
