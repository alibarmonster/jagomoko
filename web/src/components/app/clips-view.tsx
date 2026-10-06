"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { SAMPLE_DATA } from "@/lib/config";
import { CLIPS_LIVE } from "@/lib/chain/config";
import { bountyReward, bountyStage, rankClips, type BountyStage } from "@/lib/domain/clips";
import { viewTx } from "@/lib/chain/explorer";
import { formatUsd } from "@/lib/utils/money";
import { clipUrl } from "@/lib/utils/sanitize";
import type { Bounty, Clip, ClipsData, Creator } from "@/lib/data/types";
import { xpForClipWin } from "@/lib/domain/xp";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { Mascot } from "@/components/ui/mascot";
import { EmptyState } from "@/components/ui/skeleton";
import { MonoLabel } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { useNow } from "@/components/clock";
import { useSession } from "@/components/session";
import { AuthDialog } from "./auth-dialog";
import { ClipCard } from "./clip-card";
import { useCelebrate } from "./reward";
import { SectionHeading } from "./section-heading";
import { SubmitClipSheet } from "./submit-clip-sheet";

const same = (a: string | null | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();
const pad = (id: string) => id.padStart(2, "0");

function fundingLine(b: Bounty, creatorName: string) {
  if (b.escrow > 0n && b.communityFunds > 0n) return `${formatUsd(b.escrow)} from ${creatorName} + ${formatUsd(b.communityFunds)} from the community`;
  if (b.communityFunds > 0n) return "from the community treasury";
  if (b.escrow > 0n) return `from ${creatorName}`;
  return "waiting for the community to fund it";
}

const STAGE_LINE: Record<BountyStage, string> = {
  clips: "Clips close in",
  voting: "Voting ends in",
  settling: "Voting is over",
  won: "Won",
  refunded: "No winner",
};

/** A guild's clip bounties: send a clip (Bards), vote for the best one (everyone), and settle it. */
export function ClipsView({ creator, data }: { creator: Creator; data: ClipsData }) {
  const s = useSession();
  const now = useNow(1000);
  const { push } = useToast();
  const celebrate = useCelebrate();
  const [sending, setSending] = React.useState<Bounty | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const clipsOf = (b: Bounty) => rankClips(data.clips.filter((c) => c.bountyId === b.id));
  const active = data.bounties.filter((b) => {
    const st = bountyStage(b, now);
    return st === "clips" || st === "voting" || st === "settling";
  });
  const past = data.bounties.filter((b) => !active.includes(b));
  const myWin = past.find((b) => b.status === "Won" && b.winnerClipId && s.state.clipsSent[b.id] === b.winnerClipId && now - b.voteEnd < 7 * 86_400_000);

  async function vote(b: Bounty, c: Clip) {
    setBusy(c.id);
    const r = await s.actions.voteClip(b.id, c.id);
    setBusy(null);
    if (!r.ok) return push({ tone: "danger", title: r.error });
    if (s.state.character && r.value.xp > 0n) celebrate(r.value, s.state.character.role, r.tx);
    else push({ tone: "success", title: "Vote counted", action: viewTx(r.tx) });
  }

  async function settle(b: Bounty) {
    setBusy(b.id);
    const r = await s.actions.settleBounty(b.id);
    setBusy(null);
    if (!r.ok) return push({ tone: "danger", title: r.error });
    push({ tone: "success", title: "Bounty settled", description: "The winner has been paid.", action: viewTx(r.tx) });
  }

  if (data.bounties.length === 0) {
    return (
      <div className="relative max-w-2xl">
        <EmptyState
          title="No clip bounties yet"
          description={
            !SAMPLE_DATA && !CLIPS_LIVE
              ? "Clip bounties are switching on soon. Bards will send clips here, and the whole guild votes for the best one."
              : `When ${creator.handle} posts one, Bards send clips here and the whole guild votes for the best one.`
          }
          icon={<Mascot name="bard-wave" height={96} />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {myWin ? <YourClipWon bounty={myWin} clip={data.clips.find((c) => c.id === myWin.winnerClipId)} /> : null}

      {active.map((b, i) => {
        const stage = bountyStage(b, now);
        const clips = clipsOf(b);
        const myClip = s.state.clipsSent[b.id];
        const myVote = s.state.clipVotes[b.id];
        const leader = clips[0];
        return (
          <section key={b.id} aria-labelledby={`bounty-${b.id}`} className="relative">
            {i === 0 ? <Mascot name="bard-peek" height={64} className="absolute -top-12 right-6 z-10 sm:right-10" /> : null}
            <Card className="relative p-4 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <MonoLabel>Clip bounty · {pad(b.id)}</MonoLabel>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  {STAGE_LINE[stage]}
                  {stage === "clips" ? <Countdown endsAt={b.submitEnd} /> : stage === "voting" ? <Countdown endsAt={b.voteEnd} /> : null}
                </span>
              </div>
              <h2 id={`bounty-${b.id}`} className="mt-1.5 text-xl text-ink">
                {b.title}
              </h2>
              <p className="mt-1 text-sm text-muted">
                <span className="font-mono text-base text-ink tnum">{formatUsd(bountyReward(b), { cents: "auto" })}</span> {fundingLine(b, creator.handle)}
              </p>
              <p className="mt-1 text-xs text-subtle">
                {b.clipCount} {b.clipCount === 1 ? "clip" : "clips"} · {b.voteCount} {b.voteCount === 1 ? "vote" : "votes"} · the guild votes, and the most vote power wins
              </p>

              <div className="mt-4">
                {stage === "clips" ? (
                  myClip ? (
                    <p className="inline-flex items-center gap-2 rounded-md bg-signal-tint px-3 py-2 text-sm text-signal-ink">
                      <Check className="size-4" aria-hidden /> Your clip is in. Voting opens when clips close.
                    </p>
                  ) : s.signedIn && s.hasCharacter ? (
                    <Button variant="primary" className="w-full sm:w-auto" onClick={() => setSending(b)}>
                      {s.state.character?.role === "Bard" ? "Send a clip" : "Only Bards send clips"}
                    </Button>
                  ) : (
                    <AuthDialog trigger={<Button className="w-full sm:w-auto">Send a clip</Button>} />
                  )
                ) : stage === "voting" ? (
                  <p className="text-sm text-muted">{myVote ? "You voted. The board updates as votes come in." : "Pick your favorite below. One vote per bounty."}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-muted">
                      {leader ? <>Voting is over. Settle it to pay {leader.authorName}.</> : <>Voting is over and nobody got a vote, so the money goes back.</>}
                    </p>
                    <Button variant="signal" size="sm" loading={busy === b.id} onClick={() => settle(b)}>
                      Settle the bounty
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {clips.length > 0 ? (
              <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
                {clips.map((c, rank) => {
                  const mine = same(s.address, c.author) || myClip === c.id;
                  const voted = myVote === c.id;
                  return (
                    <ClipCard
                      key={c.id}
                      clip={c}
                      badge={
                        rank === 0 && c.votes > 0 && stage !== "clips" ? (
                          <span className="rounded-xs bg-pending px-1.5 py-0.5 font-mono text-2xs text-ink">{stage === "voting" ? "Leading" : "Top"}</span>
                        ) : undefined
                      }
                      footer={
                        stage === "voting" ? (
                          s.signedIn && s.hasCharacter ? (
                            <Button
                              size="sm"
                              variant={voted ? "secondary" : "primary"}
                              className="w-full"
                              disabled={!!myVote || mine}
                              loading={busy === c.id}
                              onClick={() => vote(b, c)}
                            >
                              {voted ? "Your vote" : mine ? "Your clip" : myVote ? "Voted" : "Vote"}
                            </Button>
                          ) : (
                            <AuthDialog
                              trigger={
                                <Button size="sm" variant="secondary" className="w-full">
                                  Sign in to vote
                                </Button>
                              }
                            />
                          )
                        ) : mine ? (
                          <p className="font-mono text-2xs text-subtle">Your clip</p>
                        ) : undefined
                      }
                    />
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-subtle">No clips yet. Bards, this one is wide open.</p>
            )}
          </section>
        );
      })}

      {past.length > 0 ? (
        <section aria-labelledby="past-bounties">
          <SectionHeading id="past-bounties" title="Past bounties" />
          <ul className="divide-y divide-line">
            {past.map((b) => {
              const winner = b.winnerClipId ? data.clips.find((c) => c.id === b.winnerClipId) : undefined;
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{b.title}</span>
                    <span className="font-mono text-2xs text-subtle">
                      {b.status === "Won" ? `Won by ${winner?.authorName ?? "a Bard"} · ${formatUsd(b.paidOut)}` : "No winner · the money went back"}
                    </span>
                  </span>
                  {winner?.url && clipUrl(winner.url) ? (
                    <a
                      href={clipUrl(winner.url)!.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow ugc"
                      className="text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                    >
                      Watch the winner
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <SubmitClipSheet bounty={sending} open={sending !== null} onOpenChange={(o) => (o ? null : setSending(null))} />
    </div>
  );
}

/** The moment a Bard's clip takes a bounty. */
function YourClipWon({ bounty, clip }: { bounty: Bounty; clip?: Clip }) {
  const { push } = useToast();
  const link = clip?.url ? clipUrl(clip.url) : undefined;
  const xp = bounty.paidOut >= 1_000_000n ? xpForClipWin("Bard") : 0n;
  return (
    <Card className="overflow-hidden bg-signal-tint">
      <div className="flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:text-left">
        <Mascot name="bard-cheer" height={140} alt="" />
        <div>
          <h2 className="text-2xl text-ink">Your clip won!</h2>
          <p className="mt-1 text-sm text-muted">&ldquo;{bounty.title}&rdquo;: the guild voted yours the best.</p>
          <p className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="rounded-xs bg-surface px-2 py-1 font-mono text-sm text-ink tnum">{formatUsd(bounty.paidOut, { cents: "always" })} sent to your account</span>
            {xp > 0n ? <span className="rounded-xs bg-surface px-2 py-1 font-mono text-sm text-signal-ink tnum">+{xp.toString()} XP</span> : null}
          </p>
          {link ? (
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() =>
                void navigator.clipboard.writeText(link.url).then(
                  () => push({ title: "Clip link copied" }),
                  () => push({ tone: "danger", title: "Couldn’t copy the link" }),
                )
              }
            >
              <Copy className="size-3.5" aria-hidden /> Share your clip
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
