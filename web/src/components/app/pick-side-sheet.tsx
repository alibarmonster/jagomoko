"use client";

import * as React from "react";
import { RadioGroup } from "radix-ui";
import { cn } from "@/lib/cn";
import { formatUsd, usd, type Usd } from "@/lib/money";
import { battleEstimate, BATTLE_TREASURY_CUT_BPS } from "@/lib/outcomes";
import { sleep } from "@/lib/sleep";
import { xpForJoin } from "@/lib/xp";
import type { Battle } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AmountPicker } from "@/components/ui/amount-picker";
import { FieldError } from "@/components/ui/field";
import { PRACTICE_GOLD, useSession, type Reward } from "@/components/session";
import { ActionDone } from "./action-done";
import { AuthFlow } from "./auth-flow";
import { useCelebrate } from "./reward";

/** Pick a side of a battle. Shows the payout estimate (and its caveat) before confirming. */
export function PickSideSheet({
  battle,
  initialSide,
  open,
  onOpenChange,
}: {
  battle: Battle;
  initialSide: 0 | 1;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useSession();
  const celebrate = useCelebrate();
  const [side, setSide] = React.useState<0 | 1>(initialSide);
  const [amount, setAmount] = React.useState<Usd | null>(usd(5));
  const [status, setStatus] = React.useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [reward, setReward] = React.useState<Reward | null>(null);
  const [done, setDone] = React.useState<{ side: 0 | 1; amount: Usd } | null>(null);

  React.useEffect(() => {
    if (open) setSide(initialSide);
    else {
      setStatus("idle");
      setError(null);
      setReward(null);
    }
  }, [open, initialSide]);

  const existing = session.state.picks[battle.id];
  const lockedSide = existing?.side;
  const activeSide = lockedSide ?? side;
  const labels = [battle.sideA, battle.sideB] as const;

  const ready =
    session.signedIn && session.hasCharacter && (battle.pointsMode || session.state.balance > 0n);
  const character = session.state.character;
  const balance = session.state.balance;
  const stake = battle.pointsMode ? 0n : (amount ?? 0n);
  const shortfall = !battle.pointsMode && amount !== null && balance < amount;
  const est = !battle.pointsMode && amount !== null ? battleEstimate(amount, activeSide, [battle.poolA, battle.poolB]) : null;

  async function confirm() {
    if (!battle.pointsMode && amount === null) return;
    setStatus("pending");
    setError(null);
    await sleep(600);
    const r = session.actions.joinBattle(battle.id, activeSide, stake, battle.pointsMode);
    if (!r.ok) {
      setStatus("idle");
      setError(r.error);
      return;
    }
    setDone({ side: activeSide, amount: stake });
    setReward(r.value);
    setStatus("done");
    if (character) celebrate(r.value, character.role);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {!ready ? (
          <>
            <DialogTitle className="sr-only">Create your character to pick a side</DialogTitle>
            <DialogDescription className="sr-only">Sign in with your email, choose a role and add practice gold.</DialogDescription>
            <AuthFlow />
          </>
        ) : status === "done" && reward && done ? (
          <ActionDone
            title="Your pick is in."
            body={
              <>
                You picked <strong className="font-medium text-ink">{labels[done.side]}</strong>
                {done.amount > 0n ? <> with {formatUsd(done.amount)}</> : null}. Picks close when the match starts.
              </>
            }
            reward={reward}
            onClose={() => onOpenChange(false)}
            onMore={battle.pointsMode ? undefined : () => setStatus("idle")}
            moreLabel="Add to my pick"
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Pick a side</DialogTitle>
              <DialogDescription>{battle.question}</DialogDescription>
            </DialogHeader>

            <RadioGroup.Root
              value={String(activeSide)}
              onValueChange={(v) => setSide(Number(v) as 0 | 1)}
              aria-label="Side"
              className="grid grid-cols-2 gap-2.5"
            >
              {([0, 1] as const).map((s) => (
                <RadioGroup.Item
                  key={s}
                  value={String(s)}
                  disabled={lockedSide !== undefined && lockedSide !== s}
                  className={cn(
                    "rounded-md border border-line-strong bg-surface p-3.5 text-left transition duration-(--dur-micro) ease-out",
                    "hover:bg-sunken data-[state=checked]:border-signal data-[state=checked]:bg-signal-tint disabled:opacity-50 disabled:hover:bg-surface",
                  )}
                >
                  <span className="block text-base font-medium text-ink">{labels[s]}</span>
                  <span className="mt-0.5 block font-mono text-xs text-muted tnum">
                    {battle.pointsMode ? "XP only" : formatUsd(s === 0 ? battle.poolA : battle.poolB)}
                  </span>
                </RadioGroup.Item>
              ))}
            </RadioGroup.Root>
            {lockedSide !== undefined ? (
              <p className="mt-2 text-xs text-subtle">You already picked {labels[lockedSide]}. You can add to it, but not switch sides.</p>
            ) : null}

            {battle.pointsMode ? (
              <div className="mt-5 rounded-md border border-line bg-sunken p-3.5 text-sm text-muted">
                <p className="text-ink">Free to play.</p>
                <p className="mt-0.5">
                  No money moves. You earn{" "}
                  <span className="font-mono text-signal-ink tnum">+{character ? xpForJoin(character.role).toString() : "5"} XP</span> for joining and more if you&rsquo;re right.
                </p>
              </div>
            ) : (
              <>
                <AmountPicker value={amount} onChange={setAmount} id="pick-amount" className="mt-5" />
                <div className="mt-2 flex items-center justify-between text-xs text-subtle">
                  <span>Your practice gold</span>
                  <span className="font-mono tnum">{formatUsd(balance, { cents: "always" })}</span>
                </div>
                {amount !== null && est ? (
                  <div className="mt-4 space-y-1.5 text-sm text-muted">
                    <p>
                      If <span className="font-medium text-ink">{labels[activeSide]}</span> wins:{" "}
                      <span className="font-mono text-ink tnum">{formatUsd(amount)}</span> returns about{" "}
                      <span className="font-mono text-ink tnum">{formatUsd(est.payout, { cents: "always" })}</span>{" "}
                      <span className="text-subtle">(estimate &mdash; it changes as others join)</span>
                    </p>
                    <p>If it loses, the winners split your side; {Number(BATTLE_TREASURY_CUT_BPS) / 100}% goes to the treasury.</p>
                    <p>If the result can&rsquo;t be called, you get your {formatUsd(amount)} back.</p>
                  </div>
                ) : null}
              </>
            )}

            {shortfall ? (
              <div className="mt-4">
                <FieldError>You don&rsquo;t have enough practice gold for that amount.</FieldError>
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => session.actions.claimPracticeGold()}>
                  Add {formatUsd(PRACTICE_GOLD)} practice gold
                </Button>
              </div>
            ) : null}
            {error ? <FieldError className="mt-4">{error}</FieldError> : null}

            <Button
              variant="signal"
              size="lg"
              className="mt-5 w-full"
              disabled={(!battle.pointsMode && amount === null) || shortfall}
              loading={status === "pending"}
              onClick={confirm}
            >
              {battle.pointsMode
                ? `Pick ${labels[activeSide]} (free)`
                : amount === null
                  ? "Pick an amount"
                  : `Pick ${labels[activeSide]} for ${formatUsd(amount)}`}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
