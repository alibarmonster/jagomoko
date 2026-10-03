"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { XPBar } from "@/components/ui/progress";
import { useSession, type Reward } from "@/components/session";
import { LevelUpBurst, XPGainChip } from "./reward";

/**
 * Settled success state shared by every action sheet: a check (or the level-up
 * burst), a plain sentence, the XP gain and the new progress.
 */
export function ActionDone({
  title,
  body,
  reward,
  onClose,
  onMore,
  moreLabel = "Do more",
}: {
  title: string;
  body: React.ReactNode;
  reward: Reward;
  onClose: () => void;
  onMore?: () => void;
  moreLabel?: string;
}) {
  const session = useSession();
  return (
    <div>
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <DialogDescription className="sr-only">Your action went through. Here is your XP.</DialogDescription>
      <div className="flex flex-col items-center pt-2 text-center">
        {reward.levelUp ? (
          <LevelUpBurst level={reward.levelUp.to} />
        ) : (
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-signal-tint text-signal-ink">
            <Check className="size-6" aria-hidden />
          </span>
        )}
        <h3 className="mt-4 text-xl text-ink">{reward.levelUp ? `Level ${reward.levelUp.to}` : title}</h3>
        <p className="mt-1.5 max-w-[34ch] text-sm text-muted">{body}</p>
        <div className="mt-4 h-7">
          <XPGainChip xp={reward.xp} />
        </div>
        <div className="mt-1 w-full max-w-[18rem]">
          <XPBar value={session.progress.pct} size="lg" label="XP to next level" />
          <p className="mt-1.5 flex justify-between font-mono text-2xs text-subtle tnum">
            <span>Level {session.progress.level}</span>
            <span>
              {session.progress.into.toString()} / {session.progress.span.toString()} XP
            </span>
          </p>
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        {onMore ? (
          <Button variant="secondary" className="flex-1" onClick={onMore}>
            {moreLabel}
          </Button>
        ) : null}
        <Button className="flex-1" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
