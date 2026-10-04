"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { SAMPLE_DATA } from "@/lib/config";
import { formatUsd } from "@/lib/money";
import type { Quest } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { Field, Input, inputBase } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/skeleton";
import { MarketStatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { usePending } from "@/lib/use-pending";
import { viewTx } from "@/lib/explorer";
import { useNow } from "@/components/clock";
import { SectionHeading } from "@/components/app/section-heading";
import { ReportDialog } from "./report-dialog";
import { resolveQuests, useStudio } from "./studio-store";

const DURATIONS = [
  ...(SAMPLE_DATA ? [{ value: 2, label: "2 minutes (sample)" }] : []),
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
];

/** Create quests, report their results, and finalize them once the challenge window is over. */
export function StudioQuests({ quests }: { quests: Quest[] }) {
  const studio = useStudio();
  const { push } = useToast();
  const now = useNow(1000);
  const [title, setTitle] = React.useState("");
  const [minutes, setMinutes] = React.useState(DURATIONS[0]!.value);
  const [error, setError] = React.useState<string | null>(null);
  const [reporting, setReporting] = React.useState<Quest | null>(null);
  const { pending, run } = usePending();

  const list = resolveQuests(quests, studio.state, now);

  function create(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      const r = await studio.actions.createQuest({ title, minutes });
      if (!r.ok) return setError(r.error);
      setError(null);
      setTitle("");
      push({ tone: "success", title: "Quest created", description: "It’s live in your realm now.", action: viewTx(r.tx) });
    });
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl text-ink">Quests</h1>
        <p className="mt-1 text-sm text-muted">Crowdfunded challenges for your stream. Report the result with proof, and the money follows the rules.</p>
      </header>

      <Card id="new" className="p-4 md:p-5">
        <form onSubmit={create} noValidate className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-start">
          <Field label="New quest" htmlFor="quest-title" error={error} hint="Be specific and checkable, like “Beat the Ender Dragon in under 1 hour”." counter={`${title.length}/120`}>
            <Input id="quest-title" value={title} maxLength={140} placeholder="Beat the boss without taking damage" onChange={(e) => setTitle(e.target.value)} invalid={!!error} />
          </Field>
          <div>
            <label htmlFor="quest-time" className="mb-1.5 block text-sm font-medium text-ink">
              Time to complete
            </label>
            <select id="quest-time" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={`${inputBase} h-10 px-3`}>
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" className="md:mt-[26px]" loading={pending}>
            <Plus aria-hidden /> Create quest
          </Button>
        </form>
      </Card>

      <section aria-labelledby="quest-list">
        <SectionHeading id="quest-list" title="All quests" meta={`${list.length} total`} />
        {list.length === 0 ? (
          <EmptyState title="No quests yet" description="Create your first quest above." />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {list.map((q) => {
                const windowOver = q.status === "Proposed" && q.challengeDeadline !== undefined && q.challengeDeadline <= now;
                const needsReport = q.status === "Open" && q.goalDeadline <= now;
                return (
                  <li key={q.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                    <div className="min-w-0 flex-1 basis-60">
                      <p className="truncate text-sm font-medium text-ink">{q.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                        <MarketStatusPill type="Quest" status={q.status} />
                        <span className="font-mono tnum">{formatUsd(q.pool)} backed</span>
                        <span className="font-mono tnum">{q.backers} backers</span>
                        {q.status === "Open" ? (
                          <span className="inline-flex items-baseline gap-1">
                            <Countdown endsAt={q.goalDeadline} /> left
                          </span>
                        ) : null}
                        {q.status === "Proposed" && q.challengeDeadline && !windowOver ? (
                          <span className="inline-flex items-baseline gap-1">
                            <Countdown endsAt={q.challengeDeadline} /> to dispute
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {q.status === "Open" ? (
                        <Button size="sm" variant={needsReport ? "primary" : "secondary"} onClick={() => setReporting(q)}>
                          {needsReport ? "Report the result" : "Report early"}
                        </Button>
                      ) : null}
                      {q.status === "Proposed" ? (
                        windowOver ? (
                          <Button
                            size="sm"
                            loading={pending}
                            onClick={() =>
                              run(async () => {
                                const r = await studio.actions.finalize("q", q.id);
                                if (!r.ok) return push({ tone: "danger", title: "Couldn’t finalize", description: r.error });
                                push({ tone: "success", title: "Quest finalized", description: "Payouts are ready to claim.", action: viewTx(r.tx) });
                              })
                            }
                          >
                            Finalize
                          </Button>
                        ) : SAMPLE_DATA ? (
                          <Button size="sm" variant="ghost" onClick={() => studio.actions.skipWindow("q", q.id)}>
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
          target={{ kind: "quest", id: reporting.id, title: reporting.title }}
          open
          onOpenChange={(o) => {
            if (!o) setReporting(null);
          }}
        />
      ) : null}
    </div>
  );
}
