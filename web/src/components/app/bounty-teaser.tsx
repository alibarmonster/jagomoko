"use client";

import * as React from "react";
import { bountyReward, bountyStage } from "@/lib/domain/clips";
import { formatUsd } from "@/lib/utils/money";
import { routes } from "@/lib/routing/routes";
import type { Bounty } from "@/lib/data/types";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { Mascot } from "@/components/ui/mascot";
import { MonoLabel } from "@/components/ui/status-pill";
import { useNow } from "@/components/clock";

/** The guild's open clip bounty, on its board: where a Bard sends a clip, and where everyone votes. */
export function BountyTeaser({ bounties, handle }: { bounties: Bounty[]; handle: string }) {
  const now = useNow(5_000);
  const open = bounties.find((b) => {
    const stage = bountyStage(b, now);
    return stage === "clips" || stage === "voting";
  });
  if (!open) return null;
  const stage = bountyStage(open, now);

  return (
    <Card className="relative mt-10">
      <Mascot name="bard-peek" height={48} className="absolute -top-[38px] right-5" />
      <div className="p-4 md:p-5">
        <MonoLabel>Clip bounty</MonoLabel>
        <p className="mt-1 text-base text-ink">{open.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
          <span className="font-mono text-ink tnum">{formatUsd(bountyReward(open))}</span>
          <span aria-hidden>·</span>
          {stage === "clips" ? (
            <>
              clips close in <Countdown endsAt={open.submitEnd} />
            </>
          ) : (
            <>
              voting ends in <Countdown endsAt={open.voteEnd} />
            </>
          )}
        </p>
        <ButtonLink href={routes.clips(handle)} variant="secondary" size="sm" className="mt-3">
          {stage === "clips" ? "Send a clip" : "Vote for the best clip"}
        </ButtonLink>
      </div>
    </Card>
  );
}
