"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { routes } from "@/lib/routes";
import { ROLE_META } from "@/lib/roles";
import type { Battle, Creator, Quest } from "@/lib/data/types";
import type { Split } from "@/lib/outcomes";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/skeleton";
import { RelativeTime } from "@/components/ui/relative-time";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/session";
import { AuthDialog } from "./auth-dialog";
import { BattleCard } from "./battle-card";
import { CharacterCard } from "./character-card";
import { QuestCard } from "./quest-card";
import { SectionHeading } from "./section-heading";
import { useCelebrate } from "./reward";

/** Your character sheet: identity, what you've backed and picked, and where your XP came from. */
export function MeView({ quests, battles, creators }: { quests: Quest[]; battles: Battle[]; creators: Creator[] }) {
  const s = useSession();
  const { push } = useToast();
  const celebrate = useCelebrate();

  if (!s.ready) {
    return (
      <div className="grid gap-8 lg:grid-cols-12" aria-busy="true">
        <Skeleton className="h-[420px] lg:col-span-4" />
        <div className="space-y-4 lg:col-span-8">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!s.signedIn || !s.state.character) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <EmptyState
          title="You don’t have a character yet"
          description="Create one in under a minute. Pick a role, add some practice gold and join a quest."
          action={
            <AuthDialog
              trigger={<Button size="lg">Create your character</Button>}
            />
          }
        />
      </div>
    );
  }

  const c = s.state.character;
  const backedTotal = Object.values(s.state.backed).reduce((a, b) => a + b, 0n);
  const tippedTotal = s.state.tips.reduce((a, t) => a + t.amount, 0n);
  const myQuests = quests.filter((q) => q.id in s.state.backed);
  const myBattles = battles.filter((b) => b.id in s.state.picks);
  const remaining = s.progress.ceil - c.xp;
  // each quest is judged by the split of its own realm
  const realmOf = (creatorId: string): { split: Split; name: string } => {
    const r = creators.find((x) => x.id === creatorId);
    return r
      ? { split: { creatorBps: r.creatorBps, treasuryBps: r.treasuryBps, communityBps: r.communityBps }, name: r.handle }
      : { split: { creatorBps: 9_800, treasuryBps: 100, communityBps: 100 }, name: "the creator" };
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <CharacterCard
          name={c.name}
          role={c.role}
          xp={c.xp}
          address={s.state.email ?? c.name}
          stats={{ backed: backedTotal, tipped: tippedTotal, since: c.since }}
          className="lg:sticky lg:top-24"
        />
        <p className="mt-4 text-sm text-muted">
          <span className="font-mono text-ink tnum">{remaining.toString()} XP</span> to level {s.level + 1}.{" "}
          {c.role === "Judge" && s.level < 5 ? "Judges unlock the jury at level 5." : ROLE_META[c.role].blurb}
        </p>
      </div>

      <div className="space-y-10 lg:col-span-8">
        <section aria-labelledby="my-quests">
          <SectionHeading id="my-quests" title="Your quests" meta={`${myQuests.length} backed`} />
          {myQuests.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {myQuests.map((q) => {
                const realm = realmOf(q.creatorId);
                return <QuestCard key={q.id} quest={q} split={realm.split} creatorName={realm.name} />;
              })}
            </div>
          ) : (
            <EmptyState
              title="No quests backed yet"
              description="When you back a quest it shows up here, with a claim button once it's settled."
              action={
                <ButtonLink href={routes.realms} variant="secondary">
                  Find a quest
                </ButtonLink>
              }
            />
          )}
        </section>

        <section aria-labelledby="my-battles">
          <SectionHeading id="my-battles" title="Your battles" meta={`${myBattles.length} joined`} />
          {myBattles.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {myBattles.map((b) => (
                <BattleCard key={b.id} battle={b} />
              ))}
            </div>
          ) : (
            <EmptyState title="No battles joined yet" description="Pick a side on a live match to earn XP." />
          )}
        </section>

        <section aria-labelledby="xp-log">
          <SectionHeading id="xp-log" title="XP history" />
          {s.state.xpLog.length > 0 ? (
            <Card>
              <ul className="divide-y divide-line px-4">
                {s.state.xpLog.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className="text-ink">{e.label}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-signal-ink tnum">{e.xp > 0n ? `+${e.xp.toString()}` : "—"} XP</span>
                      <RelativeTime at={e.at} className="font-mono text-2xs text-subtle" />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState title="Nothing yet" description="Tip, back a quest or pick a side and your XP shows up here." />
          )}
        </section>

        {s.mode === "sample" ? (
          <section aria-labelledby="sample-controls">
            <SectionHeading id="sample-controls" title="Sample controls" meta="prototype only" />
            <Card className="p-4">
              <p className="text-sm text-muted">
                These shortcuts exist only while the app runs on sample data, so you can explore flows that normally take time: the jury (level 5), claims and
                leveling up.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const r = s.actions.addSampleXp(500n);
                    celebrate(r, c.role);
                  }}
                >
                  Add 500 XP
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    s.actions.loadSampleHistory();
                    push({ title: "Sample history added", description: "You now have settled quests and a battle to claim." });
                  }}
                >
                  Load sample history
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    s.actions.signOut();
                    push({ title: "Sample session reset" });
                  }}
                >
                  Reset session
                </Button>
              </div>
            </Card>
          </section>
        ) : null}

        <p className="text-sm text-muted">
          <Link href={routes.realms} className="inline-flex items-center gap-1.5 rounded-xs font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            Browse realms <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </p>
      </div>
    </div>
  );
}
