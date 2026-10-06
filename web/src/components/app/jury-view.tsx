"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import type { JuryCase } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/skeleton";
import { XPBar } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { JURY_MIN_LEVEL, useSession } from "@/components/session";
import { usePending } from "@/hooks/use-pending";
import { xpForLevel } from "@/lib/domain/xp";
import { AuthDialog } from "./auth-dialog";
import { JuryCaseCard } from "./jury-case-card";
import { SectionHeading } from "./section-heading";

/** Are you eligible to serve? Judges at level 5+ can enlist; everyone else sees what it takes. */
function Eligibility({ poolSize }: { poolSize: number }) {
  const s = useSession();
  const { push } = useToast();
  const { pending, run } = usePending();

  if (!s.ready) return <Card className="h-28 animate-pulse-soft bg-sunken" aria-busy="true" />;

  if (!s.signedIn || !s.state.character) {
    return (
      <Card className="p-5">
        <p className="text-base text-ink">Want to serve on a jury?</p>
        <p className="mt-1 text-sm text-muted">Create a Judge character. Judges settle disputes and earn XP and small fees for honest votes.</p>
        <div className="mt-4">
          <AuthDialog trigger={<Button>Create your character</Button>} />
        </div>
      </Card>
    );
  }

  const c = s.state.character;
  if (c.role !== "Judge") {
    return (
      <Card className="p-5">
        <p className="inline-flex items-center gap-2 text-base text-ink">
          <Lock className="size-4 text-subtle" aria-hidden /> Only Judges serve on juries
        </p>
        <p className="mt-1 text-sm text-muted">
          You&rsquo;re a {c.role}. Roles are chosen once and can&rsquo;t be changed, but you can follow along and dispute results you think are wrong.
        </p>
      </Card>
    );
  }

  if (s.level < JURY_MIN_LEVEL) {
    const target = xpForLevel(JURY_MIN_LEVEL);
    return (
      <Card className="p-5">
        <p className="text-base text-ink">Reach level {JURY_MIN_LEVEL} to serve</p>
        <p className="mt-1 text-sm text-muted">Back quests, pick sides and vote on the treasury to earn XP.</p>
        <XPBar value={Number((c.xp * 1000n) / target) / 1000} size="lg" className="mt-4" label={`XP toward level ${JURY_MIN_LEVEL}`} />
        <p className="mt-1.5 flex justify-between font-mono text-2xs text-subtle tnum">
          <span>Level {s.level}</span>
          <span>
            {c.xp.toString()} / {target.toString()} XP
          </span>
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <p className="text-base text-ink">You&rsquo;re eligible for jury duty</p>
        <p className="mt-1 text-sm text-muted">
          {s.state.enlisted ? "You’re in the pool. When a result is disputed you may be called." : "Join the pool to be called when a result is disputed."}
        </p>
        <p className="mt-1 font-mono text-2xs text-subtle tnum">{poolSize + (s.state.enlisted ? 1 : 0)} Judges in the pool</p>
      </div>
      <label className="flex items-center gap-3 text-sm text-ink">
        Available for jury duty
        <Switch
          checked={s.state.enlisted}
          disabled={pending}
          onCheckedChange={() =>
            run(async () => {
              const r = await s.actions.toggleEnlist();
              if (!r.ok) push({ tone: "danger", title: "Couldn’t update", description: r.error });
            })
          }
          aria-label="Available for jury duty"
        />
      </label>
    </Card>
  );
}

export function JuryView({ cases, poolSize }: { cases: JuryCase[]; poolSize: number }) {
  const open = cases.filter((c) => !c.resolved);
  const closed = cases.filter((c) => c.resolved);
  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <h1 className="text-2xl text-ink">Jury</h1>
        <p className="mt-2 text-base text-muted">
          When a result is disputed, Judges with nothing at stake decide what happened. The majority wins. A tie voids the result and everyone is refunded.
        </p>
      </header>

      <Eligibility poolSize={poolSize} />

      <section aria-labelledby="open-cases">
        <SectionHeading id="open-cases" title="Open cases" meta={`${open.length} open`} />
        {open.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {open.map((c) => (
              <JuryCaseCard key={c.id} item={c} />
            ))}
          </div>
        ) : (
          <EmptyState title="No open cases" description="When someone disputes a result, the case shows up here." />
        )}
      </section>

      <section aria-labelledby="closed-cases">
        <SectionHeading id="closed-cases" title="Recent rulings" />
        {closed.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {closed.map((c) => (
              <JuryCaseCard key={c.id} item={c} />
            ))}
          </div>
        ) : (
          <EmptyState title="No rulings yet" />
        )}
      </section>
    </div>
  );
}
