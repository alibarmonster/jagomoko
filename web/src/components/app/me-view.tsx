"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { routes } from "@/lib/routing/routes";
import { guildRank, guildTag } from "@/lib/domain/guild";
import { ROLE_META } from "@/lib/domain/roles";
import type { Battle, Creator, Quest } from "@/lib/data/types";
import type { Split } from "@/lib/domain/outcomes";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { usePending } from "@/hooks/use-pending";
import { cleanText, LIMITS } from "@/lib/utils/sanitize";
import { EmptyState, Skeleton } from "@/components/ui/skeleton";
import { RelativeTime } from "@/components/ui/relative-time";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/session";
import { ExperienceCard, useWeb3 } from "@/components/experience";
import { AuthDialog } from "./auth-dialog";
import { BattleCard } from "./battle-card";
import { CharacterCard } from "./character-card";
import { QuestCard } from "./quest-card";
import { RankBadge } from "./guild-rank";
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
        <ExperienceCard className="mt-8" />
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
        />
        <p className="mt-4 text-sm text-muted">
          <span className="font-mono text-ink tnum">{remaining.toString()} XP</span> to level {s.level + 1}.{" "}
          {c.role === "Judge" && s.level < 5 ? "Judges unlock the jury at level 5." : ROLE_META[c.role].blurb}
        </p>
        <ChangeName current={c.name} />
        <ExperienceCard className="mt-6" />
      </div>

      <div className="space-y-10 lg:col-span-8">
        <section aria-labelledby="my-guilds">
          <SectionHeading id="my-guilds" title="Your guilds" meta={`${s.state.guilds.length} joined`} />
          <OwnGuild realm={s.state.realm} hasJoined={s.state.guilds.length > 0} />
          {s.state.guilds.length > 0 ? (
            <Card>
              <ul className="divide-y divide-line">
                {s.state.guilds.map((g) => (
                  <li key={g.memberId}>
                    <Link href={routes.members(g.handleKey)} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-sunken">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {g.handle}&rsquo;s guild <span className="font-mono text-2xs font-normal text-subtle">{guildTag(g.handle)}</span>
                        </span>
                        <span className="font-mono text-2xs text-subtle">{g.memberCount} members</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <RankBadge rank={guildRank(g.guildXp, g.isJago)} />
                        <span className="font-mono text-sm text-ink tnum">{g.guildXp.toString()} XP</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : s.state.realm ? null : (
            <EmptyState
              title="No guild yet"
              description="Streaming? Start your own guild, the home of your community. You also join a streamer’s guild when you tip, back a quest or pick a side there."
              action={<ButtonLink href={routes.studio}>Create your guild</ButtonLink>}
            />
          )}
        </section>

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
            Browse guilds <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Names are kept off chain, so changing one is free and instant: no transaction, just a signature. */
/**
 * The guild this account runs, if it streams. The same account can run one guild and play in
 * others: a character is who you are, a guild is a streamer's community.
 */
function OwnGuild({ realm, hasJoined }: { realm: { creatorId: string; handle: string } | null; hasJoined: boolean }) {
  if (realm) {
    return (
      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="font-mono text-2xs text-subtle">Your guild</p>
          <p className="truncate text-sm font-medium text-ink">
            {realm.handle}&rsquo;s guild <span className="font-mono text-2xs font-normal text-subtle">{guildTag(realm.handle)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={routes.studio} size="sm">
            Creator studio
          </ButtonLink>
          <ButtonLink href={routes.realm(realm.handle.toLowerCase())} size="sm" variant="secondary">
            View guild
          </ButtonLink>
        </div>
      </Card>
    );
  }
  // with no guild joined either, the empty state below offers it
  if (!hasJoined) return null;
  return (
    <p className="mb-3 text-sm text-muted">
      Streaming too?{" "}
      <Link href={routes.studio} className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
        Create your guild
      </Link>
    </p>
  );
}

function ChangeName({ current }: { current: string }) {
  const { actions } = useSession();
  const web3 = useWeb3();
  const { push } = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(current);
  const [error, setError] = React.useState<string | null>(null);
  const { pending, run } = usePending();
  const cleaned = cleanText(name, LIMITS.name);

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 mt-2"
        onClick={() => {
          setName(current);
          setError(null);
          setOpen(true);
        }}
      >
        Change name
      </Button>
    );
  }

  return (
    <form
      noValidate
      className="mt-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const r = await actions.renameCharacter(name);
          if (!r.ok) return setError(r.error);
          setOpen(false);
          push({ tone: "success", title: "Name saved" });
        });
      }}
    >
      <Field
        label="Character name"
        htmlFor="me-name"
        error={error}
        counter={`${Array.from(cleaned.value).length}/${LIMITS.name}`}
        hint={web3 ? "Kept off the blockchain, so you can change it any time." : "You can change it any time."}
      >
        <Input
          id="me-name"
          autoComplete="nickname"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 64))}
          invalid={!!error}
          aria-describedby={error ? "me-name-error" : "me-name-hint"}
        />
      </Field>
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" loading={pending} disabled={cleaned.value.length === 0 || cleaned.value === current}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
