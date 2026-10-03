"use client";

import * as React from "react";
import { RadioGroup } from "radix-ui";
import { cn } from "@/lib/cn";
import { proofDomain } from "@/lib/format";
import { safeUrl } from "@/lib/sanitize";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CHALLENGE_MS, useStudio } from "./studio-store";

type Target = { kind: "quest"; id: string; title: string } | { kind: "battle"; id: string; title: string; sideA: string; sideB: string };

/**
 * Report a result with a proof link. The link is validated as you type with
 * the same rules the public record applies, and viewers only ever see its
 * domain — so a bad link can't be hidden behind friendly text.
 */
export function ReportDialog({ target, open, onOpenChange }: { target: Target; open: boolean; onOpenChange: (open: boolean) => void }) {
  const studio = useStudio();
  const { push } = useToast();
  const [choice, setChoice] = React.useState<"yes" | "no">("yes");
  const [proof, setProof] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setChoice("yes");
      setProof("");
      setError(null);
    }
  }, [open]);

  const checked = proof.trim() ? safeUrl(proof) : undefined;
  const domain = proofDomain(checked);
  const invalid = proof.trim().length > 0 && !checked;
  const minutes = CHALLENGE_MS / 60_000;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r =
      target.kind === "quest"
        ? studio.actions.reportQuest(target.id, choice === "yes" ? "Yes" : "No", proof)
        : studio.actions.reportBattle(target.id, choice === "yes", proof);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onOpenChange(false);
    push({ title: "Result reported", description: `Backers have ${minutes} minutes to dispute it.` });
  }

  const options =
    target.kind === "quest"
      ? [
          { value: "yes", label: "It was completed", hint: "The pool goes to your vault." },
          { value: "no", label: "It wasn’t completed", hint: "Backers get 90% back." },
        ]
      : [
          { value: "yes", label: `${target.sideA} won`, hint: "Players who picked it split the other side." },
          { value: "no", label: `${target.sideB} won`, hint: "Players who picked it split the other side." },
        ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report the result</DialogTitle>
          <DialogDescription>&ldquo;{target.title}&rdquo;</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <RadioGroup.Root value={choice} onValueChange={(v) => setChoice(v as "yes" | "no")} aria-label="Result" className="grid gap-2">
            {options.map((o) => (
              <RadioGroup.Item
                key={o.value}
                value={o.value}
                className={cn(
                  "rounded-md border border-line-strong bg-surface p-3 text-left transition duration-(--dur-micro) ease-out hover:bg-sunken",
                  "data-[state=checked]:border-signal data-[state=checked]:bg-signal-tint",
                )}
              >
                <span className="block text-sm font-medium text-ink">{o.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{o.hint}</span>
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>

          <Field
            label={target.kind === "quest" && choice === "yes" ? "Proof link" : "Proof link (optional)"}
            htmlFor="proof"
            hint={domain ? undefined : "A VOD timestamp or match page. It must start with https://"}
            error={invalid ? "Use a full link that starts with https://" : null}
          >
            <Input
              id="proof"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://www.twitch.tv/videos/…"
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              invalid={invalid}
              aria-describedby={invalid ? "proof-error" : "proof-hint"}
            />
          </Field>
          {domain ? <p className="-mt-2 font-mono text-2xs text-success">Viewers will see: {domain}</p> : null}

          <p className="rounded-md bg-sunken p-3 text-xs text-muted">
            Backers get {minutes} minutes to dispute this. If a jury disagrees with you, the {target.kind === "quest" ? "quest is voided and everyone is refunded" : "battle is voided and stakes are refunded"}.
          </p>

          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" size="lg" className="w-full" disabled={invalid}>
            Report result
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
