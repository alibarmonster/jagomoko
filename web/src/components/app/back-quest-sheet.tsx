"use client";

import * as React from "react";
import { formatUsd, usd, type Usd } from "@/lib/utils/money";
import type { Split } from "@/lib/domain/outcomes";
import type { Quest } from "@/lib/data/types";
import { xpForBack } from "@/lib/domain/xp";
import { sleep } from "@/lib/utils/sleep";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AmountPicker } from "@/components/ui/amount-picker";
import { FieldError } from "@/components/ui/field";
import { PRACTICE_GOLD, useSession, type Reward } from "@/components/session";
import { AuthFlow } from "./auth-flow";
import { OutcomeTable } from "./outcome-table";
import { ActionDone } from "./action-done";
import { useCelebrate } from "./reward";

/**
 * Back a quest. Shows exactly where the money goes for every outcome BEFORE the
 * confirm button, then a settled success state with the XP gain.
 */
export function BackQuestSheet({
  quest,
  split,
  creatorName,
  open,
  onOpenChange,
}: {
  quest: Quest;
  split: Split;
  creatorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useSession();
  const celebrate = useCelebrate();
  const [amount, setAmount] = React.useState<Usd | null>(usd(5));
  const [status, setStatus] = React.useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [reward, setReward] = React.useState<Reward | null>(null);
  const [backedAmount, setBackedAmount] = React.useState<Usd>(0n);
  const [tx, setTx] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (!open) {
      setStatus("idle");
      setError(null);
      setReward(null);
    }
  }, [open]);

  const ready = session.signedIn && session.hasCharacter && session.state.balance > 0n;
  const character = session.state.character;
  const balance = session.state.balance;
  const shortfall = amount !== null && balance < amount;

  async function confirm() {
    if (amount === null) return;
    setStatus("pending");
    setError(null);
    if (session.mode === "sample") await sleep(650); // prototype latency; a real payment confirms in under a second
    const r = await session.actions.backQuest(quest.id, amount);
    if (!r.ok) {
      setStatus("idle");
      setError(r.error);
      return;
    }
    setBackedAmount(amount);
    setTx(r.tx);
    setReward(r.value);
    setStatus("done");
    if (character) celebrate(r.value, character.role);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {!ready ? (
          <>
            <DialogTitle className="sr-only">Create your character to back this quest</DialogTitle>
            <DialogDescription className="sr-only">Sign in with your email, choose a role and add practice gold.</DialogDescription>
            <AuthFlow />
          </>
        ) : status === "done" && reward ? (
          <ActionDone
            title="You’re in the party."
            body={
              <>
                You backed &ldquo;{quest.title}&rdquo; with {formatUsd(backedAmount, { cents: "auto" })}. It&rsquo;s held safely until the result is in.
              </>
            }
            reward={reward}
            tx={tx}
            onClose={() => onOpenChange(false)}
            onMore={() => setStatus("idle")}
            moreLabel="Back more"
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Back this quest</DialogTitle>
              <DialogDescription>&ldquo;{quest.title}&rdquo;</DialogDescription>
            </DialogHeader>

            <AmountPicker value={amount} onChange={setAmount} id="back-amount" />

            <div className="mt-2 flex items-center justify-between text-xs text-subtle">
              <span>Your practice gold</span>
              <span className="font-mono tnum">{formatUsd(balance, { cents: "always" })}</span>
            </div>

            {amount !== null ? (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium text-ink">What happens to your {formatUsd(amount, { cents: "always" })}</p>
                <OutcomeTable amount={amount} split={split} creatorName={creatorName} />
                {character ? (
                  <p className="mt-3 text-xs text-subtle">
                    You&rsquo;ll earn{" "}
                    <span className="font-mono text-signal-ink tnum">+{xpForBack(amount, character.role).toString()} XP</span>
                    {character.role === "Knight" ? " (includes the +50% Knight bonus)" : ""}.
                  </p>
                ) : null}
              </div>
            ) : null}

            {shortfall ? (
              <div className="mt-4">
                <FieldError>You don&rsquo;t have enough practice gold for that amount.</FieldError>
                <Button variant="secondary" size="sm" className="mt-2" onClick={async () => {
                    const r = await session.actions.claimPracticeGold();
                    if (!r.ok) setError(r.error);
                  }}
                >
                  Add {formatUsd(PRACTICE_GOLD)} practice gold
                </Button>
              </div>
            ) : null}
            {error ? <FieldError className="mt-4">{error}</FieldError> : null}

            <Button
              variant="signal"
              size="lg"
              className="mt-5 w-full"
              disabled={amount === null || shortfall}
              loading={status === "pending"}
              onClick={confirm}
            >
              {amount === null ? "Pick an amount" : `Back for ${formatUsd(amount, { cents: "auto" })}`}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
