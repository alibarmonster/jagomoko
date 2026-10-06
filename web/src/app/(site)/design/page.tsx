import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { buildSampleWorld } from "@/lib/data/sample";
import { usd } from "@/lib/utils/money";
import { ROLES } from "@/lib/domain/roles";
import { ActivityFeed } from "@/components/app/activity-row";
import { BattleCard } from "@/components/app/battle-card";
import { CharacterCard } from "@/components/app/character-card";
import { JuryCaseCard } from "@/components/app/jury-case-card";
import { LeaderboardRow } from "@/components/app/leaderboard-row";
import { ProposalCard } from "@/components/app/proposal-card";
import { QuestCard } from "@/components/app/quest-card";
import { LevelUpDemo, PickerDemo, ToastDemo } from "@/components/app/design-demos";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { LevelRing, SplitBar, TugBar, XPBar } from "@/components/ui/progress";
import { EmptyState, Skeleton } from "@/components/ui/skeleton";
import { RoleSigil, Wordmark } from "@/components/ui/sigil";
import { LiveDot, MarketStatusPill, StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const SWATCHES = [
  ["canvas", "#FAFAF9"], ["surface", "#FFFFFF"], ["sunken", "#F2F1F0"], ["line", "#E5E5E3"], ["line-strong", "#CCC9C6"],
  ["ink", "#0F0E0D"], ["ink-2", "#33312C"], ["muted", "#524F49"], ["subtle", "#6E6A65"], ["faint", "#8F8B85"],
  ["signal", "#6E56F8"], ["signal-tint", "#EFECFF"], ["success", "#1F7A4D"], ["danger", "#B4432F"], ["pending", "#96600F"],
] as const;

const TYPE = [
  ["text-4xl", "Turn your stream into a co-op game"],
  ["text-3xl", "Of the community, by the community"],
  ["text-2xl", "Back the challenge. Get 90% back if they miss."],
  ["text-xl", "Level up a character"],
  ["text-lg", "Quest · Beat the Ender Dragon in under 1 hour"],
  ["text-base", "Viewers back quests, call the match and level up a character."],
  ["text-sm", "Every tip splits instantly, and the split is public."],
  ["text-xs", "XP can’t be bought or transferred."],
] as const;

function Block({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="border-t border-line py-10">
      <h2 className="mb-6 text-xl text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignPage() {
  const w = buildSampleWorld(Date.now());
  const split = { creatorBps: w.creator.creatorBps, treasuryBps: w.creator.treasuryBps, communityBps: w.creator.communityBps };
  const q = (id: string) => w.quests.find((x) => x.id === id)!;
  const b = (id: string) => w.battles.find((x) => x.id === id)!;
  const alice = w.players[0]!;

  return (
    <div className="container-page py-10">
      <header className="mb-10">
        <Wordmark />
        <h1 className="mt-6 text-3xl text-ink">Design system</h1>
        <p className="mt-2 max-w-[60ch] text-base text-muted">
          Every token and component in its states. This page is the visual test bench for web/DESIGN.md. It is not linked from the product and is not indexed.
        </p>
      </header>

      <Block title="Color">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {SWATCHES.map(([name, hex]) => (
            <div key={name}>
              <div className="h-14 rounded-md border border-line" style={{ background: `var(--color-${name})` }} />
              <p className="mt-1.5 text-xs text-ink">{name}</p>
              <p className="font-mono text-2xs text-subtle">{hex}</p>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Type">
        <div className="space-y-4">
          {TYPE.map(([cls, text]) => (
            <div key={cls} className="grid items-baseline gap-2 md:grid-cols-[120px_1fr]">
              <span className="font-mono text-2xs text-subtle">{cls}</span>
              <p className={cls}>{text}</p>
            </div>
          ))}
          <div className="grid items-baseline gap-2 md:grid-cols-[120px_1fr]">
            <span className="font-mono text-2xs text-subtle">text-num · mono 600</span>
            <p className="font-mono text-num font-semibold tnum">$18,420</p>
          </div>
        </div>
      </Block>

      <Block title="Buttons">
        <div className="space-y-4">
          {(["primary", "secondary", "ghost", "signal"] as const).map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-3">
              <span className="w-20 font-mono text-2xs text-subtle">{v}</span>
              <Button variant={v} size="sm">Small</Button>
              <Button variant={v}>Medium</Button>
              <Button variant={v} size="lg">Large</Button>
              <Button variant={v}><Plus aria-hidden /> With icon</Button>
              <Button variant={v} loading>Loading</Button>
              <Button variant={v} disabled>Disabled</Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-inverse p-4">
            <span className="w-20 font-mono text-2xs text-on-inverse-muted">inverse</span>
            <Button variant="inverse">Create your character</Button>
          </div>
        </div>
      </Block>

      <Block title="Status, roles, avatars">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {(["Open", "Proposed", "Disputed", "Succeeded", "Failed", "Invalid"] as const).map((s) => (
              <MarketStatusPill key={s} type="Quest" status={s} />
            ))}
            <StatusPill>XP only</StatusPill>
            <span className="inline-flex items-center gap-2 text-sm text-muted"><LiveDot /> Live now</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            {ROLES.map((r) => (
              <span key={r} className="inline-flex items-center gap-2 text-sm text-ink">
                <RoleSigil role={r} className="size-8" /> {r}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name="Alice" size={20} />
            <Avatar name="Alice" role="Knight" size={24} />
            <Avatar name="Bob" role="Seer" size={32} />
            <Avatar name="Carol" role="Judge" size={40} />
            <Avatar name="Faye" role="Bard" size={56} />
            <AvatarStack people={w.players.slice(0, 5).map((p) => ({ name: p.name, role: p.role, seed: p.id }))} total={12} />
          </div>
        </div>
      </Block>

      <Block title="Progress and money">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <LevelRing level={3} progress={0.35} size={24} />
              <LevelRing level={7} progress={0.62} size={48} />
              <LevelRing level={12} progress={0.9} size={72} />
            </div>
            <XPBar value={0.62} size="lg" />
            <XPBar value={0.3} />
            <div>
              <p className="mb-2 text-xs text-subtle">SplitBar: $10 tip</p>
              <SplitBar split={split} amount={usd(10)} />
            </div>
            <div>
              <p className="mb-2 text-xs text-subtle">TugBar: 182 vs 96</p>
              <TugBar pools={[usd(182), usd(96)]} />
            </div>
          </div>
          <div className="space-y-5">
            <PickerDemo />
            <Field label="Input" htmlFor="d1" hint="Helper text sits underneath."><Input id="d1" placeholder="Placeholder" /></Field>
            <Field label="Input with error" htmlFor="d2" error="That didn’t go through, and nothing was charged."><Input id="d2" defaultValue="hello" invalid /></Field>
          </div>
        </div>
      </Block>

      <Block title="Quest cards">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {["1", "5", "2", "3", "4"].map((id) => (
            <QuestCard key={id} quest={q(id)} split={split} creatorName="NeonBlade" backers={w.players.slice(0, 5).map((p) => ({ name: p.name, role: p.role, seed: p.id }))} />
          ))}
        </div>
      </Block>

      <Block title="Battle cards">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <BattleCard battle={b("1")} />
          <BattleCard battle={b("2")} />
          <BattleCard battle={b("1")} locked />
          <BattleCard battle={b("3")} />
        </div>
      </Block>

      <Block title="Identity, jury, treasury, feed">
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="flex flex-wrap gap-4">
            <CharacterCard name={alice.name} role={alice.role} xp={alice.xp} address={alice.id} number={42} stats={{ backed: alice.totalBacked, won: alice.totalWon, tipped: alice.totalTipped, since: alice.createdAt }} />
          </div>
          <div className="space-y-4">
            <JuryCaseCard item={w.juryCases[0]!} />
            <JuryCaseCard item={w.juryCases[1]!} />
          </div>
          <div className="space-y-4">
            <ProposalCard proposal={w.proposals[0]!} proposerName="Alice" />
          </div>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Card className="px-4"><ActivityFeed items={w.activity.slice(0, 6)} /></Card>
          <Card className="px-4">
            <ul className="divide-y divide-line">
              {w.players.slice(0, 5).map((p, i) => (
                <LeaderboardRow key={p.id} rank={i + 1} name={p.name} seed={p.id} role={p.role} level={p.level} metric={`$${p.totalBacked / 1_000_000n}`} metricLabel="backed" you={i === 2} />
              ))}
            </ul>
          </Card>
        </div>
      </Block>

      <Block title="Feedback">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <ToastDemo />
            <LevelUpDemo />
          </div>
          <div className="space-y-4">
            <div className="flex gap-3"><Skeleton className="size-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-3/4" /></div></div>
            <EmptyState title="No quests yet" description="When NeonBlade starts one, it shows up here." action={<Button variant="secondary" size="sm">Turn on notifications</Button>} />
          </div>
        </div>
      </Block>

      <Block title="Disclosure">
        <div className="grid gap-8 md:grid-cols-2">
          <Tabs defaultValue="a">
            <TabsList><TabsTrigger value="a">Knights</TabsTrigger><TabsTrigger value="b">Seers</TabsTrigger><TabsTrigger value="c">Judges</TabsTrigger></TabsList>
            <TabsContent value="a"><p className="text-sm text-muted">Tabs use roving focus and arrow keys.</p></TabsContent>
            <TabsContent value="b"><p className="text-sm text-muted">Seers panel.</p></TabsContent>
            <TabsContent value="c"><p className="text-sm text-muted">Judges panel.</p></TabsContent>
          </Tabs>
          <Accordion type="single" collapsible className="border-t border-line">
            <AccordionItem value="1"><AccordionTrigger>Do I need crypto to play?</AccordionTrigger><AccordionContent>No. You sign in with your email.</AccordionContent></AccordionItem>
            <AccordionItem value="2"><AccordionTrigger>Is this real money?</AccordionTrigger><AccordionContent>Not yet. It runs on a test network.</AccordionContent></AccordionItem>
          </Accordion>
        </div>
      </Block>

      <Block title="Ambient scenes">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(["room", "couch", "desk", "crowd", "knight", "seer", "judge", "bard"] as const).map((s) => (
            <PhotoFrame key={s} scene={s} label={s} className="aspect-[4/3]" />
          ))}
        </div>
      </Block>
    </div>
  );
}
