"use client";

import * as React from "react";
import { Clapperboard, ExternalLink, Eye, EyeOff, Plus } from "lucide-react";
import { SAMPLE_DATA } from "@/lib/config";
import { CLIPS_LIVE } from "@/lib/chain/config";
import { bountyReward, bountyStage, PLATFORM_LABEL } from "@/lib/clips";
import { fetchClipsClient } from "@/lib/data/client";
import type { Bounty, ClipPayout, ClipsData } from "@/lib/data/types";
import { viewTx } from "@/lib/explorer";
import { formatUsd, parseUsd } from "@/lib/money";
import { clipUrl } from "@/lib/sanitize";
import { usePending } from "@/lib/use-pending";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { Field, Input, inputBase, Textarea } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/skeleton";
import { MonoLabel, ProposalStatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { useNow } from "@/components/clock";
import { useSession } from "@/components/session";
import { DATA_CHANGED_EVENT } from "@/components/app/auto-refresh";
import { SectionHeading } from "@/components/app/section-heading";
import { useStudio } from "./studio-store";

const WINDOWS = [
  { value: 3, label: "3 minutes (demo)" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 24 * 60, label: "1 day" },
  { value: 3 * 24 * 60, label: "3 days" },
];

/** The studio screen on live data: reads the guild's bounties every few seconds and after every action. */
export function LiveStudioClips() {
  const session = useSession();
  const handle = session.state.realm?.handle;
  const [data, setData] = React.useState<ClipsData | null>(null);

  React.useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    const read = async () => {
      const next = await fetchClipsClient(handle);
      if (!cancelled && next) setData(next);
    };
    void read();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, 4_000);
    const onChange = () => void read();
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, onChange);
    };
  }, [handle]);

  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  return <StudioClips data={data} />;
}

/**
 * Post clip bounties, ask the community to fund them, hide spam, and settle them. There is no
 * "pick the winner" button: the guild votes, and the clip with the most vote power takes it.
 */
export function StudioClips({ data }: { data: ClipsData }) {
  const now = useNow(1000);
  const active = data.bounties.filter((b) => b.status === "Open");
  const done = data.bounties.filter((b) => b.status !== "Open");

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-xl text-ink">Clips &amp; bounties</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Post a bounty, your Bards send clips, and the whole guild votes. The clip with the most vote power wins. You never pick it, so nobody has to trust you
          to be fair.
        </p>
        {!SAMPLE_DATA && !CLIPS_LIVE ? (
          <p className="mt-3 rounded-md bg-sunken px-3 py-2 text-sm text-muted">Clip bounties switch on once the clip board contract is deployed.</p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <NewBounty />
        <CommunityFunding payouts={data.payouts} bounties={active} />
      </div>

      <section aria-labelledby="studio-bounties">
        <SectionHeading id="studio-bounties" title="Running bounties" meta={`${active.length} open`} />
        {active.length === 0 ? (
          <EmptyState icon={<Clapperboard className="size-6" />} title="No bounties running" description="Post one above. Bards see it on your guild’s Clips page." />
        ) : (
          <div className="space-y-5">
            {active.map((b) => (
              <BountyPanel key={b.id} bounty={b} data={data} now={now} />
            ))}
          </div>
        )}
      </section>

      {done.length > 0 ? (
        <section aria-labelledby="studio-done">
          <SectionHeading id="studio-done" title="Finished" />
          <Card>
            <ul className="divide-y divide-line">
              {done.map((b) => {
                const winner = data.clips.find((c) => c.id === b.winnerClipId);
                return (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <span className="min-w-0 truncate text-ink">{b.title}</span>
                    <span className="font-mono text-xs text-subtle tnum">
                      {b.status === "Won" ? `${winner?.authorName ?? "A Bard"} won ${formatUsd(b.paidOut)}` : "No votes · money returned"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function NewBounty() {
  const studio = useStudio();
  const session = useSession();
  const { push } = useToast();
  const [title, setTitle] = React.useState("");
  const [reward, setReward] = React.useState("10");
  const [clipMinutes, setClipMinutes] = React.useState(WINDOWS[3]!.value);
  const [voteMinutes, setVoteMinutes] = React.useState(WINDOWS[3]!.value);
  const [error, setError] = React.useState<string | null>(null);
  const { pending, run } = usePending();
  const amount = reward.trim() === "" ? 0n : parseUsd(reward);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (amount === null) return setError("Enter the reward in dollars, like 10 or 12.50.");
    void run(async () => {
      const r = await studio.actions.createBounty({ title, reward: amount, clipMinutes, voteMinutes });
      if (!r.ok) return setError(r.error);
      setError(null);
      setTitle("");
      push({ tone: "success", title: "Bounty posted", description: "Bards can send clips on your guild’s Clips page now.", action: viewTx(r.tx) });
    });
  }

  return (
    <Card className="p-4 md:p-5">
      <form onSubmit={submit} noValidate className="space-y-4">
        <h2 className="text-base font-medium text-ink">New bounty</h2>
        <Field label="Title" htmlFor="bounty-title" counter={`${title.length}/80`}>
          <Input id="bounty-title" value={title} maxLength={80} placeholder="Best clutch of the week" onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field
          label="Reward"
          htmlFor="bounty-reward"
          error={error}
          hint={`From your account: ${formatUsd(session.state.balance, { cents: "always" })} available. Use 0 to let the community fund it.`}
        >
          <Input id="bounty-reward" inputMode="decimal" prefixText="$" value={reward} onChange={(e) => setReward(e.target.value.slice(0, 12))} invalid={!!error} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <WindowSelect id="bounty-clips" label="Clips for" value={clipMinutes} onChange={setClipMinutes} />
          <WindowSelect id="bounty-votes" label="Then voting for" value={voteMinutes} onChange={setVoteMinutes} />
        </div>
        <Button type="submit" loading={pending}>
          <Plus aria-hidden /> Post bounty
        </Button>
        <p className="text-xs text-subtle">The clip board holds the reward, not you. If nobody votes, it comes back to your account.</p>
      </form>
    </Card>
  );
}

function WindowSelect({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className={`${inputBase} h-10 px-3`}>
        {WINDOWS.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CommunityFunding({ payouts, bounties }: { payouts: ClipPayout[]; bounties: Bounty[] }) {
  const studio = useStudio();
  const session = useSession();
  const { push } = useToast();
  const now = useNow(5_000);
  const [amount, setAmount] = React.useState("20");
  const [description, setDescription] = React.useState("Clip bounty pool: the best clips of the week win it.");
  const [error, setError] = React.useState<string | null>(null);
  const [target, setTarget] = React.useState<Record<string, string>>({});
  const { pending, run } = usePending();
  const parsed = parseUsd(amount);

  function ask(e: React.FormEvent) {
    e.preventDefault();
    if (parsed === null || parsed <= 0n) return setError("Enter an amount greater than zero.");
    void run(async () => {
      const r = await studio.actions.askCommunity({ amount: parsed, description });
      if (!r.ok) return setError(r.error);
      setError(null);
      push({ tone: "success", title: "Asked the community", description: "The treasury vote runs for 24 hours.", action: viewTx(r.tx) });
    });
  }

  const act = (fn: () => Promise<{ ok: boolean; error?: string; tx?: string }> | { ok: boolean; error?: string; tx?: string }, done: string) =>
    run(async () => {
      const r = await fn();
      if (!r.ok) return push({ tone: "danger", title: r.error ?? "That didn’t go through." });
      push({ tone: "success", title: done, action: viewTx(r.tx) });
    });

  return (
    <Card className="p-4 md:p-5">
      <form onSubmit={ask} noValidate className="space-y-4">
        <h2 className="text-base font-medium text-ink">Ask the community</h2>
        <p className="text-sm text-muted">The treasury votes for 24 hours. If it passes, add the money to any bounty below.</p>
        <Field label="Amount" htmlFor="ask-amount" error={error}>
          <Input id="ask-amount" inputMode="decimal" prefixText="$" value={amount} onChange={(e) => setAmount(e.target.value.slice(0, 12))} invalid={!!error} />
        </Field>
        <Field label="What it is for" htmlFor="ask-why">
          <Textarea id="ask-why" rows={2} value={description} onChange={(e) => setDescription(e.target.value.slice(0, 400))} />
        </Field>
        <Button type="submit" variant="secondary" loading={pending}>
          Ask the community
        </Button>
      </form>

      {payouts.length > 0 ? (
        <ul className="mt-5 divide-y divide-line border-t border-line">
          {payouts.map((p) => {
            const unused = p.status === "Executed" && !p.attachedTo && !p.returned;
            const voteOver = p.status === "Active" && p.endsAt <= now;
            return (
              <li key={p.proposalId} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm text-ink tnum">{formatUsd(p.amount)}</span>
                  <ProposalStatusPill status={p.status} />
                </div>
                <p className="line-clamp-2 text-xs text-muted">{p.description}</p>
                {p.status === "Active" && !voteOver ? (
                  <p className="flex items-center gap-1 text-xs text-subtle">
                    Vote ends in <Countdown endsAt={p.endsAt} />
                  </p>
                ) : null}
                {voteOver ? (
                  <Button size="sm" variant="secondary" loading={pending} onClick={() => act(() => session.actions.executeProposal(p.proposalId), "Vote closed")}>
                    Close the vote
                  </Button>
                ) : null}
                {p.attachedTo ? <p className="font-mono text-2xs text-subtle">In bounty #{p.attachedTo.padStart(2, "0")}</p> : null}
                {p.returned ? <p className="font-mono text-2xs text-subtle">Sent back to the treasury</p> : null}
                {unused ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {bounties.length > 0 ? (
                      <>
                        <select
                          aria-label="Bounty to add it to"
                          value={target[p.proposalId] ?? bounties[0]!.id}
                          onChange={(e) => setTarget((t) => ({ ...t, [p.proposalId]: e.target.value }))}
                          className={`${inputBase} h-8 max-w-48 px-2 text-sm`}
                        >
                          {bounties.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.title}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          loading={pending}
                          onClick={() => act(() => studio.actions.fundBounty(target[p.proposalId] ?? bounties[0]!.id, p.proposalId), "Added to the bounty")}
                        >
                          Add to bounty
                        </Button>
                      </>
                    ) : null}
                    <Button size="sm" variant="ghost" loading={pending} onClick={() => act(() => studio.actions.returnPayout(p.proposalId), "Sent back to the treasury")}>
                      Send back
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}

function BountyPanel({ bounty: b, data, now }: { bounty: Bounty; data: ClipsData; now: number }) {
  const studio = useStudio();
  const { push } = useToast();
  const { pending, run } = usePending();
  const stage = bountyStage(b, now);
  const clips = data.clips.filter((c) => c.bountyId === b.id).sort((x, y) => (x.weight === y.weight ? 0 : x.weight > y.weight ? -1 : 1));
  const canHide = stage === "clips" || stage === "voting";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
        <div className="min-w-0">
          <MonoLabel>Bounty · {b.id.padStart(2, "0")}</MonoLabel>
          <p className="mt-0.5 truncate text-sm font-medium text-ink">
            {b.title} · {formatUsd(bountyReward(b))}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
            {stage === "clips" ? (
              <>
                Clips close in <Countdown endsAt={b.submitEnd} />
              </>
            ) : stage === "voting" ? (
              <>
                Voting ends in <Countdown endsAt={b.voteEnd} />
              </>
            ) : (
              "Voting is over"
            )}
            <span>· {b.clipCount} clips · {b.voteCount} votes</span>
          </p>
        </div>
        {stage === "settling" ? (
          <Button
            size="sm"
            variant="signal"
            loading={pending}
            onClick={() =>
              run(async () => {
                const r = await studio.actions.settleBounty(b.id);
                if (!r.ok) return push({ tone: "danger", title: r.error });
                push({ tone: "success", title: "Bounty settled", action: viewTx(r.tx) });
              })
            }
          >
            Settle
          </Button>
        ) : null}
      </div>
      {clips.length === 0 ? (
        <p className="p-4 text-sm text-subtle">No clips yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {clips.map((c) => {
            const link = c.url ? clipUrl(c.url) : undefined;
            return (
              <li key={c.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${c.hidden ? "opacity-60" : ""}`}>
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block truncate text-sm text-ink">{c.authorName}</span>
                  <span className="font-mono text-2xs text-subtle">
                    {link ? PLATFORM_LABEL[link.platform] : "Link not shown"}
                    {c.hidden ? " · hidden" : ""}
                  </span>
                </span>
                <span className="font-mono text-xs text-muted tnum" title="Vote power: the square root of each voter’s XP, added up">
                  {c.votes} votes · {c.weight.toString()} power
                </span>
                {link ? (
                  <a href={link.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                    Watch <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : null}
                {canHide ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pending}
                    onClick={() =>
                      run(async () => {
                        const r = await studio.actions.hideClip(c.id, !c.hidden);
                        if (!r.ok) return push({ tone: "danger", title: r.error });
                        push({ tone: "success", title: c.hidden ? "Clip shown again" : "Clip hidden", action: viewTx(r.tx) });
                      })
                    }
                  >
                    {c.hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />} {c.hidden ? "Show" : "Hide"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-line px-4 py-3 text-xs text-subtle">
        Hide spam or anything that breaks your rules; a hidden clip can&rsquo;t win. Hiding is public, so use it for spam, not to choose the winner.
      </p>
    </Card>
  );
}
