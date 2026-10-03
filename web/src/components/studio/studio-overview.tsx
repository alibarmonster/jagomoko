"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { formatInt, formatUsd, usd } from "@/lib/money";
import { routes } from "@/lib/routes";
import type { Activity, Battle, Creator, Quest } from "@/lib/data/types";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { SplitBar } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { useNow } from "@/components/clock";
import { ActivityFeed } from "@/components/app/activity-row";
import { SectionHeading } from "@/components/app/section-heading";
import { resolveBattles, resolveQuests, useEffectiveSplit, useStudio } from "./studio-store";

function StatCard({ label, value, hint, action }: { label: string; value: React.ReactNode; hint?: string; action?: React.ReactNode }) {
  return (
    <Card className="flex flex-col p-4">
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-1 font-mono text-2xl text-ink tnum">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </Card>
  );
}

interface Attention {
  key: string;
  text: string;
  cta: string;
  href: string;
}

/** The creator's home: balances, what needs doing right now, where tips go. */
export function StudioOverview({
  creator,
  quests,
  battles,
  activity,
}: {
  creator: Creator;
  quests: Quest[];
  battles: Battle[];
  activity: Activity[];
}) {
  const studio = useStudio();
  const { push } = useToast();
  const now = useNow(1000);
  const split = useEffectiveSplit();

  const allQuests = resolveQuests(quests, studio.state, now);
  const allBattles = resolveBattles(battles, studio.state, now);

  const attention: Attention[] = [];
  for (const q of allQuests) {
    if (q.status === "Open" && q.goalDeadline <= now) attention.push({ key: `q${q.id}`, text: `Report the result of “${q.title}”`, cta: "Report result", href: routes.studioQuests });
    if (q.status === "Proposed" && q.challengeDeadline !== undefined && q.challengeDeadline <= now)
      attention.push({ key: `qf${q.id}`, text: `“${q.title}” is ready to finalize`, cta: "Finalize", href: routes.studioQuests });
  }
  for (const b of allBattles) {
    if (b.status === "Open" && b.closeTime <= now) attention.push({ key: `b${b.id}`, text: `Report who won “${b.question}”`, cta: "Report result", href: routes.studioBattles });
    if (b.status === "Proposed" && b.challengeDeadline !== undefined && b.challengeDeadline <= now)
      attention.push({ key: `bf${b.id}`, text: `“${b.question}” is ready to finalize`, cta: "Finalize", href: routes.studioBattles });
  }

  const pending = studio.state.pendingSplit && studio.state.pendingSplit.effectiveAt > now ? studio.state.pendingSplit : null;
  const tips = activity.filter((a) => a.kind === "Tip").slice(0, 6);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl text-ink">Overview</h1>
        <p className="mt-1 text-sm text-muted">{creator.handle} &middot; live</p>
      </header>

      {pending ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-sunken px-4 py-3 text-sm text-muted" role="status">
          <Clock className="size-4 text-subtle" aria-hidden />
          <span>
            A split change is queued: {pending.split.creatorBps / 100}% / {pending.split.treasuryBps / 100}% / {pending.split.communityBps / 100}%. It takes effect in{" "}
            <Countdown endsAt={pending.effectiveAt} />.
          </span>
        </div>
      ) : null}

      <section aria-label="Balances" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Your vault"
          value={formatUsd(creator.creatorBalance, { cents: "always" })}
          action={
            <Button size="sm" variant="secondary" onClick={() => push({ tone: "success", title: "Withdrawal started", description: "Sample data: no money moved." })}>
              Withdraw
            </Button>
          }
        />
        <StatCard label="Community treasury" value={formatUsd(creator.treasuryBalance, { cents: "always" })} hint="Voted on by your supporters" />
        <StatCard label="Community pool" value={formatUsd(creator.communityBalance, { cents: "always" })} hint="Juror fees and bounties" />
        <StatCard label="Tips received" value={formatInt(creator.tipCount)} hint={`${formatUsd(creator.totalReceived)} in total`} />
      </section>

      <section aria-labelledby="attention">
        <SectionHeading id="attention" title="Needs your attention" meta={attention.length > 0 ? `${attention.length}` : undefined} />
        {attention.length > 0 ? (
          <Card>
            <ul className="divide-y divide-line">
              {attention.map((a) => (
                <li key={a.key} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <span className="text-ink">{a.text}</span>
                  <ButtonLink href={a.href} size="sm">
                    {a.cta}
                    <ArrowRight aria-hidden />
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="flex items-center gap-3 p-4 text-sm text-muted">
            <CheckCircle2 className="size-5 text-success" aria-hidden />
            <span>
              You&rsquo;re all caught up. Start a <Link className="font-medium text-ink underline decoration-line-strong underline-offset-4" href={routes.studioQuests}>quest</Link> or a{" "}
              <Link className="font-medium text-ink underline decoration-line-strong underline-offset-4" href={routes.studioBattles}>battle</Link> to get your viewers playing.
            </span>
          </Card>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="where">
          <SectionHeading id="where" title="Where your tips go" action={<Link href={routes.studioSettings} className="text-xs text-muted underline decoration-line-strong underline-offset-4 hover:text-ink">Change split</Link>} />
          <Card className="p-4">
            <p className="mb-3 text-sm text-muted">For every $100 your supporters send:</p>
            <SplitBar split={split} amount={usd(100)} />
          </Card>
        </section>
        <section aria-labelledby="recent-tips">
          <SectionHeading id="recent-tips" title="Recent tips" />
          <Card className="px-4">
            <ActivityFeed items={tips} empty={<p className="py-6 text-center text-sm text-muted">No tips yet.</p>} />
          </Card>
        </section>
      </div>
    </div>
  );
}
