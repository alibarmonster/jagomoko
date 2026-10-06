"use client";

import * as React from "react";
import { zeroAddress } from "viem";
import { CONTRACTS } from "@/lib/chain/config";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/money";
import type { Proposal } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/ui/countdown";
import { ProposalStatusPill, MonoLabel } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { LAYER_LOCAL } from "@/lib/config";
import { useNow } from "@/components/clock";
import { useSession } from "@/components/session";
import { usePending } from "@/lib/use-pending";
import { viewTx } from "@/lib/explorer";
import { AuthDialog } from "./auth-dialog";
import { useCelebrate } from "./reward";

/** A community treasury proposal: what, how much, to whom, and where the vote stands. */
export function ProposalCard({
  proposal,
  proposerName,
  className,
}: {
  proposal: Proposal;
  proposerName?: string;
  className?: string;
}) {
  const session = useSession();
  const { push } = useToast();
  const celebrate = useCelebrate();
  const [expanded, setExpanded] = React.useState(false);
  const { pending, run } = usePending();
  const now = useNow(1000);

  const myVote = session.state.proposalVotes[proposal.id];
  const voted = myVote !== undefined;
  // a payout to the clip board funds clip bounties, not a person
  const toClipBoard = CONTRACTS.clips !== zeroAddress && proposal.recipient.toLowerCase() === CONTRACTS.clips.toLowerCase();
  const w = session.weight;
  const layer = LAYER_LOCAL && voted;
  const forW = proposal.forWeight + (layer && myVote ? w : 0n);
  const againstW = proposal.againstWeight + (layer && !myVote ? w : 0n);
  const total = forW + againstW;
  const forShare = total === 0n ? 0.5 : Number((forW * 10_000n) / total) / 10_000;
  const voters = proposal.voters + (layer ? 1 : 0);
  const active = proposal.status === "Active";
  // voting time is up but nobody has closed the vote yet
  const ended = active && proposal.endsAt <= now;
  const long = proposal.description.length > 120;

  function close() {
    return run(async () => {
      const r = await session.actions.executeProposal(proposal.id);
      if (!r.ok) return push({ tone: "danger", title: "Couldn’t close the vote", description: r.error });
      push({ tone: "success", title: "Vote closed", description: "The result is in.", action: viewTx(r.tx) });
    });
  }

  function vote(support: boolean) {
    return run(async () => {
      const r = await session.actions.voteProposal(proposal.id, support);
      if (!r.ok) {
        push({ tone: "danger", title: "Couldn’t record your vote", description: r.error });
        return;
      }
      if (session.state.character) celebrate(r.value, session.state.character.role, r.tx);
    });
  }

  return (
    <article className={cn("rounded-md border border-line bg-surface p-4", className)} aria-label="Treasury proposal">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MonoLabel>Proposal · {proposal.id.padStart(2, "0")}</MonoLabel>
        <ProposalStatusPill status={proposal.status} />
        <span className="ml-auto text-xs text-subtle">
          {active ? (
            <span className="inline-flex items-baseline gap-1.5">
              <Countdown endsAt={proposal.endsAt} endedLabel="Voting ended" /> <span>left</span>
            </span>
          ) : null}
        </span>
      </header>

      <p className={cn("mt-3 text-base text-ink", !expanded && "line-clamp-3")}>{proposal.description}</p>
      {long ? (
        <button
          type="button"
          className="mt-1 rounded-xs text-xs text-subtle underline decoration-line-strong underline-offset-2 hover:text-ink"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
        {proposal.kind === "Allocate" ? (
          <div className="col-span-2">
            <dt className="text-xs text-subtle">What it does</dt>
            <dd className="text-ink">
              {proposal.amount === 0n
                ? "Take everything back out of the Community Pool"
                : `Put ${Number(proposal.amount) / 100}% of the treasury into the Community Pool to earn yield`}
            </dd>
          </div>
        ) : (
          <>
            <div>
              <dt className="text-xs text-subtle">Amount</dt>
              <dd className="font-mono text-ink tnum">{formatUsd(proposal.amount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Goes to</dt>
              <dd className="truncate text-ink">{toClipBoard ? "Clip bounty pool" : (proposal.recipientName ?? "A viewer")}</dd>
            </div>
          </>
        )}
      </dl>

      <div className="mt-3">
        <div
          className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={`${Math.round(forShare * 100)}% of the vote weight is for, ${Math.round((1 - forShare) * 100)}% against`}
        >
          <div className="h-full bg-ink transition-[flex-grow] duration-(--dur-section) ease-in-out" style={{ flexGrow: forShare * 1000, flexBasis: 0 }} />
          <div className="h-full bg-line-strong transition-[flex-grow] duration-(--dur-section) ease-in-out" style={{ flexGrow: (1 - forShare) * 1000, flexBasis: 0 }} />
        </div>
        <p className="mt-1.5 flex justify-between font-mono text-2xs text-subtle tnum">
          <span>For {forW.toString()}</span>
          <span>{voters} voted</span>
          <span>Against {againstW.toString()}</span>
        </p>
      </div>

      {active ? (
        <div className="mt-4">
          {ended ? (
            <div>
              <p className="text-xs text-muted">
                Voting has ended. Anyone can close the vote;{" "}
                {proposal.kind === "Allocate" ? "if it passed, the treasury moves to the new share right away." : "it pays out if it passed."}
              </p>
              {session.signedIn ? (
                <Button variant="secondary" className="mt-2 w-full" loading={pending} onClick={close}>
                  Close the vote
                </Button>
              ) : null}
            </div>
          ) : voted ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-success">
              <Check className="size-3.5" aria-hidden />
              You voted {myVote ? "for" : "against"} with weight <span className="font-mono tnum">{w.toString()}</span>
            </p>
          ) : !session.signedIn || !session.hasCharacter ? (
            <AuthDialog
              trigger={
                <Button variant="secondary" className="w-full">
                  Create your character to vote
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={pending} onClick={() => vote(true)}>
                Vote for
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => vote(false)}>
                Vote against
              </Button>
            </div>
          )}
          <p className="mt-2 text-2xs text-subtle">
            Votes are weighted by the square root of your XP, so no one can dominate. The creator can veto during the beta.
          </p>
        </div>
      ) : null}
      {proposerName ? <p className="mt-3 font-mono text-2xs text-subtle">Proposed by {proposerName}</p> : null}
    </article>
  );
}
