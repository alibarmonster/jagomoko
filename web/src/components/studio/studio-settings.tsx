"use client";

import * as React from "react";
import { Clock, X } from "lucide-react";
import { formatUsd, usd } from "@/lib/money";
import type { Split } from "@/lib/outcomes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { Field, FieldError, Input } from "@/components/ui/field";
import { SplitBar } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/toast";
import { useNow } from "@/components/clock";
import { useEffectiveSplit, useStudio } from "./studio-store";

/** Two sliders that can never produce an invalid split: what you keep, and how the rest divides. */
function fromSliders(creatorPct: number, treasuryShare: number): Split {
  const rest = 100 - creatorPct;
  const treasury = Math.round((rest * treasuryShare) / 100);
  return { creatorBps: creatorPct * 100, treasuryBps: treasury * 100, communityBps: (rest - treasury) * 100 };
}

export function StudioSettings() {
  const studio = useStudio();
  const { push } = useToast();
  const now = useNow(1000);
  const current = useEffectiveSplit();

  const [creatorPct, setCreatorPct] = React.useState(current.creatorBps / 100);
  const [treasuryShare, setTreasuryShare] = React.useState(() => {
    const rest = 100 - current.creatorBps / 100;
    return rest === 0 ? 100 : Math.round((current.treasuryBps / 100 / rest) * 100);
  });
  const [error, setError] = React.useState<string | null>(null);
  const [mod, setMod] = React.useState("");
  const [modError, setModError] = React.useState<string | null>(null);

  const next = fromSliders(creatorPct, treasuryShare);
  const changed = next.creatorBps !== current.creatorBps || next.treasuryBps !== current.treasuryBps || next.communityBps !== current.communityBps;
  const pending = studio.state.pendingSplit && studio.state.pendingSplit.effectiveAt > now ? studio.state.pendingSplit : null;

  function queue() {
    const r = studio.actions.queueSplit(next);
    if (!r.ok) return setError(r.error);
    setError(null);
    push({ tone: "success", title: "Split change queued", description: "It takes effect in 24 hours, so your supporters aren’t surprised." });
  }

  function addMod(e: React.FormEvent) {
    e.preventDefault();
    const r = studio.actions.addModerator(mod);
    if (!r.ok) return setModError(r.error);
    setModError(null);
    setMod("");
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl text-ink">Split &amp; team</h1>
        <p className="mt-1 text-sm text-muted">How every tip and quest pool is divided, and who can help you run the stream.</p>
      </header>

      {pending ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-sunken px-4 py-3 text-sm text-muted" role="status">
          <Clock className="size-4 text-subtle" aria-hidden />
          <span>
            Queued: {pending.split.creatorBps / 100}% / {pending.split.treasuryBps / 100}% / {pending.split.communityBps / 100}%. Takes effect in <Countdown endsAt={pending.effectiveAt} />.
          </span>
        </div>
      ) : null}

      <Card className="p-4 md:p-5">
        <h2 className="text-lg text-ink">Revenue split</h2>
        <p className="mt-1 text-sm text-muted">At least 10% always goes to your community. That&rsquo;s a rule of the platform, not a setting.</p>

        <div className="mt-6 space-y-6">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink">
                You keep
              </span>
              <span className="font-mono text-sm text-ink tnum">{creatorPct}%</span>
            </div>
            <Slider label="What you keep" value={[creatorPct]} min={50} max={90} step={1} onValueChange={([v]) => setCreatorPct(v ?? 80)} />
            <p className="mt-1.5 text-xs text-subtle">Between 50% and 90%.</p>
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink">
                Of the rest, to the treasury
              </span>
              <span className="font-mono text-sm text-ink tnum">{treasuryShare}%</span>
            </div>
            <Slider label="Share of the rest that goes to the treasury" value={[treasuryShare]} min={0} max={100} step={5} onValueChange={([v]) => setTreasuryShare(v ?? 75)} />
            <p className="mt-1.5 text-xs text-subtle">The treasury is voted on by supporters. The rest funds juror fees and bounties.</p>
          </div>
        </div>

        <div className="mt-6 rounded-md bg-sunken p-3">
          <p className="mb-2 text-xs text-subtle">A {formatUsd(usd(10))} tip becomes</p>
          <SplitBar split={next} amount={usd(10)} />
        </div>

        <p className="mt-4 text-xs text-muted">Changes take effect 24 hours after you queue them, so your supporters are never surprised by a new split.</p>
        {error ? <FieldError className="mt-3">{error}</FieldError> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={queue} disabled={!changed}>
            Queue change
          </Button>
          {changed ? (
            <Button
              variant="ghost"
              onClick={() => {
                setCreatorPct(current.creatorBps / 100);
                const rest = 100 - current.creatorBps / 100;
                setTreasuryShare(rest === 0 ? 100 : Math.round((current.treasuryBps / 100 / rest) * 100));
              }}
            >
              Reset
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="p-4 md:p-5">
        <h2 className="text-lg text-ink">Moderators</h2>
        <p className="mt-1 text-sm text-muted">Moderators can create quests and report results with you. Like you, they can never play your battles.</p>
        <form onSubmit={addMod} noValidate className="mt-4 flex items-start gap-2">
          <Field label="Add a moderator" htmlFor="mod-name" error={modError} className="flex-1">
            <Input id="mod-name" placeholder="A handle or address" value={mod} maxLength={64} onChange={(e) => setMod(e.target.value)} invalid={!!modError} />
          </Field>
          <Button type="submit" variant="secondary" className="mt-[26px]">
            Add
          </Button>
        </form>
        <ul className="mt-3 divide-y divide-line rounded-md border border-line">
          {studio.state.moderators.length === 0 ? <li className="p-3 text-sm text-muted">No moderators yet.</li> : null}
          {studio.state.moderators.map((m) => (
            <li key={m} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-ink">{m}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m}`} onClick={() => studio.actions.removeModerator(m)}>
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
