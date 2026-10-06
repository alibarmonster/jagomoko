"use client";

import * as React from "react";
import { Clock, X } from "lucide-react";
import type { Split } from "@/lib/domain/outcomes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { Field, FieldError, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { usePending } from "@/hooks/use-pending";
import { viewTx } from "@/lib/chain/explorer";
import { useNow } from "@/components/clock";
import { SplitEditor } from "./split-editor";
import { useEffectiveSplit, useStudio, useStudioView } from "./studio-store";

export function StudioSettings() {
  const studio = useStudio();
  const { push } = useToast();
  const now = useNow(1000);
  const current = useEffectiveSplit();
  const view = useStudioView();
  const { pending: busy, run } = usePending();

  const [next, setNext] = React.useState<Split>(current);
  const [editorKey, setEditorKey] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [mod, setMod] = React.useState("");
  const [modError, setModError] = React.useState<string | null>(null);

  const changed = next.creatorBps !== current.creatorBps || next.treasuryBps !== current.treasuryBps || next.communityBps !== current.communityBps;
  const pending = view.pendingSplit && view.pendingSplit.effectiveAt > now ? view.pendingSplit : null;
  // on the real record a queued split only becomes current when someone applies it
  const due = view.live && view.pendingSplit && view.pendingSplit.effectiveAt <= now ? view.pendingSplit : null;

  function queue() {
    void run(async () => {
      const r = await studio.actions.queueSplit(next);
      if (!r.ok) return setError(r.error);
      setError(null);
      push({ tone: "success", title: "Split change queued", description: "It takes effect in 24 hours, so your supporters aren’t surprised.", action: viewTx(r.tx) });
    });
  }

  function apply() {
    void run(async () => {
      const r = await studio.actions.applySplit();
      if (!r.ok) return push({ tone: "danger", title: "Couldn’t apply the change", description: r.error });
      push({ tone: "success", title: "New split is live", action: viewTx(r.tx) });
    });
  }

  function addMod(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const r = await studio.actions.addModerator(mod);
      if (!r.ok) return setModError(r.error);
      setModError(null);
      setMod("");
    });
  }

  const shown = (who: string) => (/^0x[0-9a-fA-F]{40}$/.test(who) ? `${who.slice(0, 6)}…${who.slice(-4)}` : who);

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

      {due ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border border-line bg-sunken px-4 py-3 text-sm text-muted" role="status">
          <span>
            Ready to go live: {due.split.creatorBps / 100}% / {due.split.treasuryBps / 100}% / {due.split.communityBps / 100}%. The 24 hour notice is over.
          </span>
          <Button size="sm" onClick={apply} loading={busy}>
            Apply now
          </Button>
        </div>
      ) : null}

      <Card className="p-4 md:p-5">
        <h2 className="text-lg text-ink">Revenue split</h2>
        <p className="mt-1 text-sm text-muted">At least 2% always goes to your community. That&rsquo;s a rule of the platform, not a setting.</p>

        <div className="mt-6">
          <SplitEditor key={editorKey} initial={current} onChange={setNext} />
        </div>

        <p className="mt-4 text-xs text-muted">Changes take effect 24 hours after you queue them, so your supporters are never surprised by a new split.</p>
        {error ? <FieldError className="mt-3">{error}</FieldError> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={queue} disabled={!changed} loading={busy}>
            Queue change
          </Button>
          {changed ? (
            <Button
              variant="ghost"
              onClick={() => {
                setNext(current);
                setEditorKey((k) => k + 1);
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
          <Field label="Add a moderator" htmlFor="mod-name" error={modError} className="flex-1" hint={view.live ? "Their account address, which starts with 0x." : undefined}>
            <Input id="mod-name" placeholder={view.live ? "0x…" : "A handle or address"} value={mod} maxLength={64} onChange={(e) => setMod(e.target.value)} invalid={!!modError} />
          </Field>
          <Button type="submit" variant="secondary" className="mt-[26px]" loading={busy}>
            Add
          </Button>
        </form>
        <ul className="mt-3 divide-y divide-line rounded-md border border-line">
          {view.moderators.length === 0 ? <li className="p-3 text-sm text-muted">No moderators yet.</li> : null}
          {view.moderators.map((m) => (
            <li key={m} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-ink">{shown(m)}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${shown(m)}`} onClick={() => void run(async () => void (await studio.actions.removeModerator(m)))}>
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
