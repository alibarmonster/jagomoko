"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/roles";
import { viewTx } from "@/lib/explorer";
import { LevelRing } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { JURY_MIN_LEVEL, type Reward } from "@/components/session";

/** "+150 XP" chip that rises and fades once. */
export function XPGainChip({ xp, className }: { xp: bigint; className?: string }) {
  if (xp <= 0n) return null;
  return (
    <span
      className={cn(
        "pointer-events-none inline-flex animate-xp-chip items-center rounded-full bg-signal-tint px-2.5 py-1 font-mono text-xs font-semibold text-signal-ink tnum",
        className,
      )}
    >
      +{xp.toString()} XP
    </span>
  );
}

/**
 * The one expressive moment in the product: on level-up the ring completes, one
 * pulse expands, and eight short sparks burst once. Nothing else gets sparks.
 */
export function LevelUpBurst({ level, size = 64, className }: { level: number; size?: number; className?: string }) {
  return (
    <span className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <LevelRing level={level} progress={1} size={size} />
      <span className="absolute inset-0 animate-ring-pulse rounded-full border-2 border-signal" aria-hidden />
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute left-1/2 top-1/2 -ml-px h-2.5 w-0.5 animate-spark rounded-full bg-signal"
          style={{ ["--spark-angle" as string]: `${i * 45}deg`, animationDelay: "120ms" }}
        />
      ))}
    </span>
  );
}

export function levelUnlockLine(role: Role, level: number): string {
  if (role === "Judge") return level >= JURY_MIN_LEVEL ? "You can now serve on the jury." : `Level ${JURY_MIN_LEVEL} unlocks the jury.`;
  return "Your voice in the community treasury just got louder.";
}

/** Returns a function that turns an action's Reward into toasts. */
export function useCelebrate() {
  const { push } = useToast();
  return React.useCallback(
    (reward: Reward, role: Role, tx?: string) => {
      const action = viewTx(tx);
      if (reward.levelUp) {
        push({
          tone: "levelup",
          title: `Level ${reward.levelUp.to}`,
          description: `${levelUnlockLine(role, reward.levelUp.to)} +${reward.xp.toString()} XP`,
          duration: 6500,
          action,
        });
      } else if (reward.xp > 0n) {
        push({ tone: "success", title: `+${reward.xp.toString()} XP`, duration: action ? undefined : 3000, action });
      }
    },
    [push],
  );
}
