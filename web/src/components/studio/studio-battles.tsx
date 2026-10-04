"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { SAMPLE_DATA } from "@/lib/config";
import { formatUsd } from "@/lib/money";
import type { Battle } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { Field, Input, inputBase } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/skeleton";
import { MarketStatusPill, StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { usePending } from "@/lib/use-pending";
import { viewTx } from "@/lib/explorer";
import { useNow } from "@/components/clock";
import { SectionHeading } from "@/components/app/section-heading";
import { ReportDialog } from "./report-dialog";
import { resolveBattles, useStudio, useRealmHandle } from "./studio-store";

const CLOSES = [
  ...(SAMPLE_DATA ? [{ value: 2, label: "2 minutes (sample)" }] : []),
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 20, label: "20 minutes" },
  { value: 40, label: "40 minutes" },
];

/** Create prediction battles and report who won. You can never play your own battles. */
export function StudioBattles({ battles }: { battles: Battle[] }) {
  const studio = useStudio();
  const { push } = useToast();
  const now = useNow(1000);
  const [question, setQuestion] = React.useState("");
  const [sideA, setSideA] = React.useState("Win");
  const [sideB, setSideB] = React.useState("Lose");
  const [minutes, setMinutes] = React.useState(CLOSES[0]!.value);
  const [points, setPoints] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reporting, setReporting] = React.useState<Battle | null>(null);
  const { pending, run } = usePending();
  const handle = useRealmHandle();

  const list = resolveBattles(battles, studio.state, now);

  function create(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const r = await studio.actions.createBattle({ question, sideA, sideB, minutes, pointsMode: points });
      if (!r.ok) return setError(r.error);
      setError(null);
      setQuestion("");
      push({ tone: "success", title: "Battle created", description: "Viewers can pick a side until it closes.", action: viewTx(r.tx) });
    });
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl text-ink">Battles</h1>
        <p className="mt-1 text-sm text-muted">
          Viewer-versus-viewer predictions. Picks close when the match starts, and neither you nor your moderators can take a side.
        </p>
      </header>

      <Card className="p-4 md:p-5">
        <form onSubmit={create} noValidate className="space-y-4">
          <Field label="Question" htmlFor="battle-q" error={error} counter={`${question.length}/120`} hint={`A question with two clear answers, like “Does ${handle} win this match?”`}>
            <Input id="battle-q" value={question} maxLength={140} placeholder={`Does ${handle} win this match?`} onChange={(e) => setQuestion(e.target.value)} invalid={!!error} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-[1fr_1fr_200px]">
            <Field label="First side" htmlFor="battle-a">
              <Input id="battle-a" value={sideA} maxLength={32} onChange={(e) => setSideA(e.target.value)} />
            </Field>
            <Field label="Second side" htmlFor="battle-b">
              <Input id="battle-b" value={sideB} maxLength={32} onChange={(e) => setSideB(e.target.value)} />
            </Field>
            <div>
              <label htmlFor="battle-close" className="mb-1.5 block text-sm font-medium text-ink">
                Picks close in
              </label>
              <select id="battle-close" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={`${inputBase} h-10 px-3`}>
                {CLOSES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <label className="flex items-center gap-3 text-sm text-ink">
              <Switch checked={points} onCheckedChange={setPoints} aria-label="Points mode" />
              <span>
                Points mode <span className="text-muted">&mdash; free to play, pays XP only</span>
              </span>
            </label>
            <Button type="submit" loading={pending}>
              <Plus aria-hidden /> Create battle
            </Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="battle-list">
        <SectionHeading id="battle-list" title="All battles" meta={`${list.length} total`} />
        {list.length === 0 ? (
          <EmptyState title="No battles yet" description="Create your first battle above." />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {list.map((b) => {
                const closed = b.closeTime <= now;
                const windowOver = b.status === "Proposed" && b.challengeDeadline !== undefined && b.challengeDeadline <= now;
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                    <div className="min-w-0 flex-1 basis-60">
                      <p className="truncate text-sm font-medium text-ink">{b.question}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                        <MarketStatusPill type="Battle" status={b.status} />
                        {b.pointsMode ? <StatusPill>XP only</StatusPill> : <span className="font-mono tnum">{formatUsd(b.poolA + b.poolB)} in play</span>}
                        <span className="font-mono tnum">{b.playersA + b.playersB} players</span>
                        {b.status === "Open" && !closed ? (
                          <span className="inline-flex items-baseline gap-1">
                            <Countdown endsAt={b.closeTime} /> until picks close
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.status === "Open" && closed ? (
                        <Button size="sm" onClick={() => setReporting(b)}>
                          Report the result
                        </Button>
                      ) : null}
                      {b.status === "Proposed" ? (
                        windowOver ? (
                          <Button
                            size="sm"
                            loading={pending}
                            onClick={() =>
                              run(async () => {
                                const r = await studio.actions.finalize("b", b.id);
                                if (!r.ok) return push({ tone: "danger", title: "Couldn’t finalize", description: r.error });
                                push({ tone: "success", title: "Battle finalized", description: "Winners can claim now.", action: viewTx(r.tx) });
                              })
                            }
                          >
                            Finalize
                          </Button>
                        ) : SAMPLE_DATA ? (
                          <Button size="sm" variant="ghost" onClick={() => studio.actions.skipWindow("b", b.id)}>
                            Skip the wait (sample)
                          </Button>
                        ) : null
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      {reporting ? (
        <ReportDialog
          target={{ kind: "battle", id: reporting.id, title: reporting.question, sideA: reporting.sideA, sideB: reporting.sideB }}
          open
          onOpenChange={(o) => {
            if (!o) setReporting(null);
          }}
        />
      ) : null}
    </div>
  );
}
