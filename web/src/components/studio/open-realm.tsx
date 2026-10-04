"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { HANDLE_MIN, normalizeHandleInput, validateHandle } from "@/lib/handle";
import { isHandleTaken } from "@/lib/chain/reads";
import type { Split } from "@/lib/outcomes";
import { usePending } from "@/lib/use-pending";
import { viewTx } from "@/lib/explorer";
import { useSession } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { SplitEditor } from "./split-editor";
import { DEFAULT_SPLIT } from "./studio-store";

type Availability = "idle" | "checking" | "free" | "taken" | "unknown";

/**
 * Where a streamer opens their realm: a handle (it becomes the address, /c/<handle>) and the
 * revenue split. One sponsored transaction registers it on the registry, from the streamer's own
 * account, so the streamer owns it. No character is needed to stream; viewers need one to play.
 */
export function OpenRealm() {
  const session = useSession();
  const { push } = useToast();
  const { pending, run } = usePending();
  const [handle, setHandle] = React.useState("");
  const [split, setSplit] = React.useState<Split>(DEFAULT_SPLIT);
  const [availability, setAvailability] = React.useState<Availability>("idle");
  const [error, setError] = React.useState<string | null>(null);

  const checked = validateHandle(handle);
  const candidate = checked.ok ? checked.handle : "";

  // look the name up on the registry shortly after the person stops typing
  React.useEffect(() => {
    if (!candidate) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const taken = await isHandleTaken(candidate);
        if (!cancelled) setAvailability(taken ? "taken" : "free");
      } catch {
        if (!cancelled) setAvailability("unknown");
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [candidate]);

  const hint =
    availability === "checking"
      ? "Checking…"
      : availability === "free"
        ? undefined
        : `${HANDLE_MIN}-32 characters: lowercase letters, numbers and underscores.`;
  const taken = availability === "taken";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!checked.ok) return setError(checked.error);
    if (taken) return setError("That name is taken. Try another.");
    void run(async () => {
      const r = await session.actions.openRealm(handle, split);
      if (!r.ok) return setError(r.error);
      setError(null);
      push({ tone: "success", title: "Your realm is open", description: `Viewers can find you at /c/${candidate}.`, action: viewTx(r.tx) });
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="font-mono text-2xs text-subtle">Creator studio</p>
      <h1 className="mt-2 text-2xl text-ink">Open your realm</h1>
      <p className="mt-2 text-base text-muted">
        Your realm is your page. Viewers tip you, back your quests and call your matches, and every dollar splits the way you set it below. You can change the
        split later, with a 24-hour notice for your supporters.
      </p>

      <Card className="mt-6 p-4 md:p-5">
        <Field label="Your handle" htmlFor="realm-handle" hint={hint} error={taken ? "That name is taken." : null}>
          <Input
            id="realm-handle"
            prefixText="/c/"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder="karambol"
            value={handle}
            maxLength={32}
            onChange={(e) => setHandle(normalizeHandleInput(e.target.value))}
            invalid={taken}
            aria-describedby={taken ? "realm-handle-error" : "realm-handle-hint"}
          />
        </Field>
        {availability === "free" ? (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-success">
            <Check className="size-3.5" aria-hidden /> /c/{candidate} is available
          </p>
        ) : null}
      </Card>

      <Card className="mt-4 p-4 md:p-5">
        <h2 className="text-lg text-ink">Revenue split</h2>
        <p className="mt-1 text-sm text-muted">At least 2% always goes to your community. That&rsquo;s a rule of the platform, not a setting.</p>
        <div className="mt-6">
          <SplitEditor initial={DEFAULT_SPLIT} onChange={setSplit} />
        </div>
      </Card>

      <p className="mt-4 text-xs text-muted">
        You and your moderators can never play in your own battles. You don&rsquo;t need a character to stream; your viewers create theirs.
      </p>
      {error ? <FieldError className="mt-3">{error}</FieldError> : null}
      <Button type="submit" size="lg" className="mt-5 w-full" loading={pending} disabled={!checked.ok || taken}>
        Open my realm
      </Button>
    </form>
  );
}
