"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { proofDomain } from "@/lib/format";
import { formatUsd } from "@/lib/money";
import { questOutcomes, type Split } from "@/lib/outcomes";
import { routes } from "@/lib/routes";
import { safeUrl } from "@/lib/sanitize";
import type { MarketStatus, Quest } from "@/lib/data/types";
import { Button, ButtonLink } from "@/components/ui/button";
import { Countdown } from "@/components/ui/countdown";
import { AvatarStack } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RelativeTime } from "@/components/ui/relative-time";
import { MarketStatusPill, MonoLabel } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/session";
import { usePending } from "@/lib/use-pending";
import { BackQuestSheet } from "./back-quest-sheet";

export interface Backer {
  name: string;
  role?: "Knight" | "Seer" | "Judge" | "Bard";
  seed?: string;
}

/**
 * A crowdfunded stream challenge. `sample` renders the same component with no
 * session wiring (used inside labelled marketing composites).
 */
export function QuestCard({
  quest,
  split,
  creatorName,
  backers = [],
  sample = false,
  frozenSeconds,
  className,
}: {
  quest: Quest;
  split: Split;
  creatorName: string;
  backers?: Backer[];
  sample?: boolean;
  /** Marketing composites show a fixed time instead of ticking */
  frozenSeconds?: number;
  className?: string;
}) {
  const session = useSession();
  const { push } = useToast();
  const { pending, run } = usePending();
  const [backOpen, setBackOpen] = React.useState(false);
  const [disputeOpen, setDisputeOpen] = React.useState(false);

  const mine = sample ? 0n : (session.state.backed[quest.id] ?? 0n);
  const disputedLocal = !sample && !!session.state.disputes[quest.id];
  const status: MarketStatus = disputedLocal && quest.status === "Proposed" ? "Disputed" : quest.status;
  const claimKey = `q${quest.id}`;
  const claimed = !sample && !!session.state.claimed[claimKey];

  const pool = quest.pool + mine;
  const count = quest.backers + (mine > 0n ? 1 : 0);
  const proof = quest.proofUrl ? safeUrl(quest.proofUrl) : undefined;
  const domain = proofDomain(proof);
  const resolved = status === "Succeeded" || status === "Failed" || status === "Invalid";

  const refund = status === "Failed" ? questOutcomes(mine, split).failed.refund : status === "Invalid" ? mine : 0n;

  return (
    <article
      className={cn("rounded-md border border-line bg-surface p-4", className)}
      aria-label={`Quest: ${quest.title}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MonoLabel>Quest · {quest.id.padStart(2, "0")}</MonoLabel>
        <MarketStatusPill type="Quest" status={status} />
        <span className="ml-auto text-xs text-subtle">
          {status === "Open" ? (
            <span className="inline-flex items-baseline gap-1.5">
              <Countdown endsAt={quest.goalDeadline} frozen={frozenSeconds} />
              <span>left</span>
            </span>
          ) : status === "Proposed" && quest.challengeDeadline ? (
            <span className="inline-flex items-baseline gap-1.5">
              <Countdown endsAt={quest.challengeDeadline} endedLabel="Closing" frozen={frozenSeconds} />
              <span>to dispute</span>
            </span>
          ) : status === "Disputed" ? (
            <span>Jury deciding</span>
          ) : quest.resolvedAt ? (
            <RelativeTime at={quest.resolvedAt} />
          ) : null}
        </span>
      </header>

      <h3 className="mt-3 line-clamp-2 text-lg text-ink">{quest.title}</h3>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-sm text-muted">
          <span className="font-mono text-ink tnum">{formatUsd(pool)}</span> backed
        </p>
        <div className="flex items-center gap-2">
          <AvatarStack people={backers} total={count} size={24} max={4} />
          <p className="text-sm text-muted">
            <span className="font-mono text-ink tnum">{count}</span> in the party
          </p>
        </div>
      </div>

      {status !== "Open" ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
          {resolved ? (
            <span className="text-ink">
              {status === "Succeeded"
                ? `Complete — ${formatUsd(quest.toCreatorVault)} went to ${creatorName}’s vault.`
                : status === "Failed"
                  ? `Failed — ${formatUsd(quest.refundable)} refunded, ${formatUsd(quest.toTreasury, { cents: "always" })} to the treasury.`
                  : "Void — everyone gets a full refund."}
            </span>
          ) : null}
          {domain && proof ? (
            <a
              href={proof}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-0.5 rounded-xs text-muted underline decoration-line-strong underline-offset-2 transition hover:text-ink"
            >
              Proof: {domain}
              <ArrowUpRight className="size-3" aria-hidden />
            </a>
          ) : (
            <span>No proof link</span>
          )}
        </p>
      ) : null}

      <div className="mt-4">
        {mine > 0n ? (
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs text-success">
            <Check className="size-3.5" aria-hidden />
            You backed <span className="font-mono tnum">{formatUsd(mine)}</span>
          </p>
        ) : null}

        {status === "Open" ? (
          <Button
            variant={mine > 0n ? "secondary" : "primary"}
            className="w-full"
            onClick={() => setBackOpen(true)}
          >
            {mine > 0n ? "Back more" : "Back this quest"}
          </Button>
        ) : status === "Proposed" ? (
          mine > 0n ? (
            <Button variant="secondary" className="w-full" onClick={() => setDisputeOpen(true)}>
              Dispute this result
            </Button>
          ) : (
            <p className="text-xs text-subtle">Backing is closed. Backers can dispute until the window ends.</p>
          )
        ) : status === "Disputed" ? (
          <ButtonLink href={routes.jury} variant="secondary" className="w-full">
            See the jury
          </ButtonLink>
        ) : mine > 0n && !claimed ? (
          <Button
            variant="signal"
            className="w-full"
            loading={pending}
            onClick={() =>
              run(async () => {
                const r = await session.actions.claim(claimKey, refund);
                if (!r.ok) {
                  push({ tone: "danger", title: "Couldn’t claim", description: r.error });
                  return;
                }
                push({
                  tone: "success",
                  title: refund > 0n ? `${formatUsd(refund, { cents: "always" })} is back in your account` : "Quest bonus claimed",
                });
              })
            }
          >
            {refund > 0n ? `Claim ${formatUsd(refund, { cents: "always" })}` : "Claim your bonus XP"}
          </Button>
        ) : mine > 0n && claimed ? (
          <p className="text-xs text-subtle">Claimed.</p>
        ) : null}
      </div>

      {!sample ? (
        <>
          <BackQuestSheet quest={quest} split={split} creatorName={creatorName} open={backOpen} onOpenChange={setBackOpen} />
          <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
            <DialogContent width="sm">
              <DialogHeader>
                <DialogTitle>Send this to a jury?</DialogTitle>
                <DialogDescription>
                  If you think &ldquo;{quest.title}&rdquo; wasn&rsquo;t really completed, a jury of Judges decides.
                </DialogDescription>
              </DialogHeader>
              <ul className="space-y-2 text-sm text-muted">
                <li>Judges who didn&rsquo;t back this quest see the proof and vote.</li>
                <li>The majority decides. A tie voids the quest and everyone is refunded in full.</li>
                <li>Nothing is charged for disputing.</li>
              </ul>
              <div className="mt-5 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setDisputeOpen(false)}>
                  Not now
                </Button>
                <Button
                  className="flex-1"
                  loading={pending}
                  onClick={() =>
                    run(async () => {
                      const r = await session.actions.dispute(quest.id);
                      if (!r.ok) {
                        push({ tone: "danger", title: "Couldn’t send it to a jury", description: r.error });
                        return;
                      }
                      setDisputeOpen(false);
                      push({ title: "Sent to a jury", description: "Three Judges will review the proof." });
                    })
                  }
                >
                  Send to jury
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </article>
  );
}
