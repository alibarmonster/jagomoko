"use client";

import * as React from "react";
import { formatUsd, usd, type Usd } from "@/lib/money";
import type { Split } from "@/lib/outcomes";
import { cleanText, LIMITS } from "@/lib/sanitize";
import { sleep } from "@/lib/sleep";
import { xpForTip } from "@/lib/xp";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AmountPicker } from "@/components/ui/amount-picker";
import { Field, FieldError, Input } from "@/components/ui/field";
import { SplitBar } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/session";
import { useEffectiveSplit } from "@/components/studio/studio-store";
import { AuthDialog } from "./auth-dialog";
import { useCelebrate } from "./reward";

/** Tip the creator. The split is shown for the exact amount before you press the button. */
export function TipPanel({ creatorName, className }: { creatorName: string; split?: Split; className?: string }) {
  const split = useEffectiveSplit();
  const uid = React.useId(); // both the mobile and desktop panel are in the DOM, so ids must be unique
  const session = useSession();
  const celebrate = useCelebrate();
  const { push } = useToast();
  const [amount, setAmount] = React.useState<Usd | null>(usd(5));
  const [memo, setMemo] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ready = session.signedIn && session.hasCharacter;
  const short = amount !== null && session.state.balance < amount;
  const cleaned = cleanText(memo, LIMITS.memo);

  async function send() {
    if (amount === null) return;
    setPending(true);
    setError(null);
    if (session.mode === "sample") await sleep(600);
    const r = await session.actions.tip(amount, memo);
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setMemo("");
    push({ tone: "success", title: `Sent ${formatUsd(amount)} to ${creatorName}`, description: "Your tip was split between the creator and the community.", duration: 3500 });
    if (session.state.character) celebrate(r.value, session.state.character.role);
  }

  return (
    <Card className={className}>
      <div className="p-4 md:p-5">
        <h2 className="text-lg text-ink">Tip {creatorName}</h2>
        <p className="mt-0.5 text-sm text-muted">Every tip splits instantly, and the split is public.</p>

        <AmountPicker value={amount} onChange={setAmount} id={`${uid}-amount`} className="mt-4" />

        <Field
          label="Say something (optional)"
          htmlFor={`${uid}-memo`}
          counter={`${Array.from(cleaned.value).length}/${LIMITS.memo}`}
          className="mt-4"
        >
          <Input
            id={`${uid}-memo`}
            value={memo}
            maxLength={200}
            placeholder="gg, that clutch was unreal"
            onChange={(e) => setMemo(e.target.value)}
          />
        </Field>

        {amount !== null ? (
          <div className="mt-4 rounded-md bg-sunken p-3">
            <p className="mb-2 text-xs text-subtle">Your {formatUsd(amount, { cents: "always" })} goes to</p>
            <SplitBar split={split} amount={amount} />
            {session.state.character ? (
              <p className="mt-2.5 font-mono text-2xs text-subtle">
                You earn <span className="text-signal-ink tnum">+{xpForTip(amount).toString()} XP</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? <FieldError className="mt-3">{error}</FieldError> : null}

        <div className="mt-4">
          {!session.ready ? (
            <div className="h-12" aria-hidden />
          ) : ready ? (
            <Button size="lg" className="w-full" disabled={amount === null || short} loading={pending} onClick={send}>
              {amount === null ? "Pick an amount" : short ? "Not enough practice gold" : `Tip ${formatUsd(amount)}`}
            </Button>
          ) : (
            <AuthDialog
              trigger={
                <Button size="lg" className="w-full">
                  Create your character to tip
                </Button>
              }
            />
          )}
        </div>
      </div>
    </Card>
  );
}
