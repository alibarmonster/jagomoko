"use client";

import * as React from "react";
import { ArrowUpRight, Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { proofDomain } from "@/lib/utils/format";
import { safeUrl } from "@/lib/utils/sanitize";
import type { JuryCase } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/ui/countdown";
import { MonoLabel, StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { LAYER_LOCAL } from "@/lib/config";
import { useNow } from "@/components/clock";
import { JURY_MIN_LEVEL, useSession } from "@/components/session";
import { usePending } from "@/hooks/use-pending";
import { viewTx } from "@/lib/chain/explorer";
import { AuthDialog } from "./auth-dialog";

/** A disputed claim and the two votes: "It happened" / "It didn't". */
export function JuryCaseCard({ item, sample = false, className }: { item: JuryCase; sample?: boolean; className?: string }) {
  const session = useSession();
  const { push } = useToast();
  const proof = item.proofUrl ? safeUrl(item.proofUrl) : undefined;
  const domain = proofDomain(proof);
  const mine = sample ? undefined : session.state.jury[item.id];
  const yes = item.yesVotes + (LAYER_LOCAL && mine === "yes" ? 1 : 0);
  const no = item.noVotes + (LAYER_LOCAL && mine === "no" ? 1 : 0);
  const { pending, run } = usePending();
  const now = useNow(1000);
  // voting time is up but nobody has closed the case yet
  const ended = !sample && !item.resolved && item.deadline <= now;

  function close() {
    return run(async () => {
      const r = await session.actions.resolveJuryCase(item.id);
      if (!r.ok) return push({ tone: "danger", title: "Couldn’t close the case", description: r.error });
      push({ tone: "success", title: "Case closed", description: "The ruling is in.", action: viewTx(r.tx) });
    });
  }

  function vote(v: "yes" | "no") {
    return run(async () => {
      const r = await session.actions.voteJury(item.id, v);
      if (!r.ok) push({ tone: "danger", title: "Couldn’t record your vote", description: r.error });
      else push({ tone: "success", title: "Vote recorded", description: "Results show when the jury closes.", action: viewTx(r.tx) });
    });
  }

  return (
    <article className={cn("rounded-md border border-line bg-surface p-4", className)} aria-label="Jury case">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MonoLabel>Case · {item.id.padStart(2, "0")}</MonoLabel>
        <StatusPill>{item.resolved ? "Closed" : "Open"}</StatusPill>
        <span className="ml-auto text-xs text-subtle">
          {!item.resolved ? (
            <span className="inline-flex items-baseline gap-1.5">
              <Countdown endsAt={item.deadline} endedLabel="Closing" /> <span>left</span>
            </span>
          ) : null}
        </span>
      </header>

      <p className="mt-3 text-base text-ink">{item.claim}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
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
        <span>{item.jurors} Judges called</span>
      </p>

      {item.resolved ? (
        <p className="mt-4 text-sm text-ink">
          The jury ruled <strong className="font-medium">{item.verdict === "Yes" ? "it happened" : item.verdict === "No" ? "it didn’t" : "void"}</strong>{" "}
          <span className="font-mono text-xs text-subtle tnum">
            ({item.yesVotes}&ndash;{item.noVotes})
          </span>
        </p>
      ) : ended ? (
        <div className="mt-4">
          <p className="text-xs text-muted">Voting has ended. Anyone can close the case to record the ruling.</p>
          {session.signedIn ? (
            <Button variant="secondary" className="mt-2 w-full" loading={pending} onClick={close}>
              Close the case
            </Button>
          ) : null}
        </div>
      ) : mine ? (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-success">
          <Check className="size-4" aria-hidden />
          You voted &ldquo;{mine === "yes" ? "It happened" : "It didn’t"}&rdquo;. Results when the jury closes.
        </p>
      ) : sample ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" tabIndex={-1}>
            It happened
          </Button>
          <Button variant="secondary" tabIndex={-1}>
            It didn&rsquo;t
          </Button>
        </div>
      ) : !session.signedIn || !session.hasCharacter ? (
        <div className="mt-4">
          <AuthDialog
            trigger={
              <Button variant="secondary" className="w-full">
                Create your character
              </Button>
            }
          />
        </div>
      ) : !session.canServeOnJury ? (
        <div className="mt-4 rounded-md border border-line bg-sunken p-3 text-sm text-muted">
          <p className="inline-flex items-center gap-1.5 text-ink">
            <Lock className="size-3.5" aria-hidden /> Only Judges can serve here.
          </p>
          <p className="mt-0.5">Reach level {JURY_MIN_LEVEL} as a Judge to join the jury.</p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => vote("yes")}>
              It happened
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => vote("no")}>
              It didn&rsquo;t
            </Button>
          </div>
          <p className="mt-2.5 font-mono text-2xs text-subtle">
            +150 XP and up to $0.50 if you vote with the majority &middot; &minus;50 XP if not
          </p>
        </div>
      )}

      {!item.resolved && (yes > 0 || no > 0) && mine ? (
        <p className="mt-2 font-mono text-2xs text-subtle tnum">
          So far: {yes} it happened &middot; {no} it didn&rsquo;t
        </p>
      ) : null}
    </article>
  );
}
