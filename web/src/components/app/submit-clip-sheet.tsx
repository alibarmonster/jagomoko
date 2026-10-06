"use client";

import * as React from "react";
import { bountyReward, PLATFORM_LABEL } from "@/lib/domain/clips";
import { formatUsd } from "@/lib/utils/money";
import { clipUrl } from "@/lib/utils/sanitize";
import type { Bounty } from "@/lib/data/types";
import { xpForClip, xpForClipWin, xpPerClipVote } from "@/lib/domain/xp";
import { sleep } from "@/lib/utils/sleep";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Mascot, mascotFor } from "@/components/ui/mascot";
import { useSession, type Reward } from "@/components/session";
import { ActionDone } from "./action-done";
import { AuthFlow } from "./auth-flow";
import { PlatformIcon } from "./clip-card";
import { useCelebrate } from "./reward";

/**
 * A Bard sends a link to their clip for a bounty. Anyone else is told why they can't (and what they
 * can do instead). The link is checked against the same rules the indexer uses before it is sent.
 */
export function SubmitClipSheet({ bounty, open, onOpenChange }: { bounty: Bounty | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const session = useSession();
  const celebrate = useCelebrate();
  const [link, setLink] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [reward, setReward] = React.useState<Reward | null>(null);
  const [tx, setTx] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (!open) {
      setStatus("idle");
      setError(null);
      setReward(null);
      setLink("");
    }
  }, [open]);

  const character = session.state.character;
  const parsed = clipUrl(link);
  const typed = link.trim().length > 0;

  async function send() {
    if (!bounty || !parsed) return;
    setStatus("pending");
    setError(null);
    if (session.mode === "sample") await sleep(650);
    const r = await session.actions.submitClip(bounty.id, parsed.url);
    if (!r.ok) {
      setStatus("idle");
      setError(r.error);
      return;
    }
    setTx(r.tx);
    setReward(r.value);
    setStatus("done");
    if (character) celebrate(r.value, character.role);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {!bounty ? null : !session.signedIn || !character ? (
          <>
            <DialogTitle className="sr-only">Create your character to send a clip</DialogTitle>
            <DialogDescription className="sr-only">Sign in with your email and choose a role.</DialogDescription>
            <AuthFlow onSignIn={() => onOpenChange(false)} />
          </>
        ) : status === "done" && reward ? (
          <ActionDone
            title="Your clip is in"
            body={<>When clips close, the guild votes. The clip with the most vote power takes {formatUsd(bountyReward(bounty))}.</>}
            reward={reward}
            tx={tx}
            onClose={() => onOpenChange(false)}
          />
        ) : character.role !== "Bard" ? (
          <div className="flex flex-col items-center text-center">
            <Mascot name={mascotFor(character.role, "oops")} height={112} />
            <DialogTitle className="mt-3">Only Bards send clips</DialogTitle>
            <DialogDescription className="mt-1.5 max-w-[34ch]">
              You&rsquo;re a {character.role}. When clips close, vote for your favorite: every vote earns you XP, and it helps the best clip win.
            </DialogDescription>
            <Button variant="secondary" className="mt-5" onClick={() => onOpenChange(false)}>
              Got it
            </Button>
          </div>
        ) : session.state.clipsSent[bounty.id] ? (
          <div className="text-center">
            <DialogTitle>Your clip is already in</DialogTitle>
            <DialogDescription className="mt-1.5">One clip per bounty. When clips close, the guild votes.</DialogDescription>
            <Button variant="secondary" className="mt-5" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <DialogHeader>
              <DialogTitle>Send a clip</DialogTitle>
              <DialogDescription>&ldquo;{bounty.title}&rdquo;</DialogDescription>
            </DialogHeader>

            <Field
              label="Link to your clip"
              htmlFor="clip-link"
              className="mt-4"
              error={typed && !parsed ? "That link isn’t one we can show. Paste the link to a single clip." : error}
              hint="TikTok, YouTube Shorts, Twitch clips, Instagram Reels or X."
            >
              <div className="relative">
                <Input
                  id="clip-link"
                  inputMode="url"
                  autoComplete="off"
                  autoFocus
                  placeholder="https://www.tiktok.com/@you/video/…"
                  value={link}
                  onChange={(e) => setLink(e.target.value.slice(0, 512))}
                  invalid={typed && !parsed}
                  className={parsed ? "pr-28" : undefined}
                  aria-describedby={typed && !parsed ? "clip-link-error" : "clip-link-hint"}
                />
                {parsed ? (
                  <span className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-xs bg-signal-tint px-2 py-0.5 text-xs text-signal-ink">
                    <PlatformIcon platform={parsed.platform} className="size-3" />
                    {PLATFORM_LABEL[parsed.platform]}
                  </span>
                ) : null}
              </div>
            </Field>

            <dl className="mt-5 space-y-1.5 rounded-md bg-sunken px-4 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">If it wins</dt>
                <dd className="font-mono text-ink tnum">
                  {formatUsd(bountyReward(bounty))}
                  {bountyReward(bounty) >= 1_000_000n ? ` + ${xpForClipWin("Bard").toString()} XP` : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Every vote it gets</dt>
                <dd className="font-mono text-ink tnum">+{xpPerClipVote("Bard").toString()} XP</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Sending it</dt>
                <dd className="font-mono text-ink tnum">+{xpForClip("Bard").toString()} XP</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-subtle">
              One clip per bounty, Bard bonus included. Your clip stays on your own account: we only link to it, and the link never shows on stream.
            </p>

            <Button type="submit" variant="signal" size="lg" className="mt-5 w-full" disabled={!parsed} loading={status === "pending"}>
              Send clip
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
