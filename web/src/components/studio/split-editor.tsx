"use client";

import * as React from "react";
import { formatUsd, usd } from "@/lib/money";
import type { Split } from "@/lib/outcomes";
import { SplitBar } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";

/** Two sliders that can never produce an invalid split: what you keep, and how the rest divides. */
export function splitFromSliders(creatorPct: number, treasuryShare: number): Split {
  const rest = 100 - creatorPct;
  const treasury = Math.round((rest * treasuryShare) / 100);
  return { creatorBps: creatorPct * 100, treasuryBps: treasury * 100, communityBps: (rest - treasury) * 100 };
}

export function slidersFromSplit(split: Split): { creatorPct: number; treasuryShare: number } {
  const creatorPct = split.creatorBps / 100;
  const rest = 100 - creatorPct;
  return { creatorPct, treasuryShare: rest === 0 ? 100 : Math.round((split.treasuryBps / 100 / rest) * 100) };
}

/**
 * The revenue-split controls and the "$10 tip becomes" preview. At least 2% always goes to the
 * community (the slider tops out at 98), so every value it produces is a valid split.
 * Uncontrolled: mount it with a new `key` to reset it.
 */
export function SplitEditor({ initial, onChange }: { initial: Split; onChange: (split: Split) => void }) {
  const start = slidersFromSplit(initial);
  const [creatorPct, setCreatorPct] = React.useState(start.creatorPct);
  const [treasuryShare, setTreasuryShare] = React.useState(start.treasuryShare);
  const split = splitFromSliders(creatorPct, treasuryShare);

  return (
    <div>
      <div className="space-y-6">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium text-ink">You keep</span>
            <span className="font-mono text-sm text-ink tnum">{creatorPct}%</span>
          </div>
          <Slider
            label="What you keep"
            value={[creatorPct]}
            min={50}
            max={98}
            step={1}
            onValueChange={([v]) => {
              const next = v ?? 98;
              setCreatorPct(next);
              onChange(splitFromSliders(next, treasuryShare));
            }}
          />
          <p className="mt-1.5 text-xs text-subtle">Between 50% and 98%.</p>
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium text-ink">Of the rest, to the treasury</span>
            <span className="font-mono text-sm text-ink tnum">{treasuryShare}%</span>
          </div>
          <Slider
            label="Share of the rest that goes to the treasury"
            value={[treasuryShare]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => {
              const next = v ?? 50;
              setTreasuryShare(next);
              onChange(splitFromSliders(creatorPct, next));
            }}
          />
          <p className="mt-1.5 text-xs text-subtle">The treasury is voted on by supporters. The rest funds juror fees and bounties.</p>
        </div>
      </div>

      <div className="mt-6 rounded-md bg-sunken p-3">
        <p className="mb-2 text-xs text-subtle">A {formatUsd(usd(10))} tip becomes</p>
        <SplitBar split={split} amount={usd(10)} />
      </div>
    </div>
  );
}
