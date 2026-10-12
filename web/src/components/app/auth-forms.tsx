"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useSession } from "@/components/session";
import { usePending } from "@/hooks/use-pending";

/**
 * The two sign-in forms that both popups share: the email, then the 6-digit code. Sending a code
 * moves the session to the code step at once (state.pendingEmail), so this form can unmount before
 * the send settles. The email and its error therefore live in the caller, which stays mounted.
 */
export function EmailForm({
  email,
  onEmailChange,
  error,
  onError,
  submitLabel = "Continue",
}: {
  email: string;
  onEmailChange: (email: string) => void;
  error: string | null;
  onError: (error: string | null) => void;
  submitLabel?: string;
}) {
  const { actions, ready } = useSession();
  const { pending, run } = usePending();
  const id = React.useId();

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          onError(null);
          const r = await actions.requestCode(email);
          if (!r.ok) onError(r.error);
        });
      }}
    >
      <Field label="Email" htmlFor={id} error={error}>
        <Input
          id={id}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </Field>
      <Button type="submit" size="lg" className="mt-4 w-full" loading={pending || !ready}>
        {submitLabel}
        <ArrowRight aria-hidden />
      </Button>
    </form>
  );
}

const RESEND_AFTER_S = 30;

/** The code step: who it went to, the code, and a way back or a fresh code. */
export function CodeForm({
  title,
  subtitle,
  onError,
  onSignedIn,
  submitLabel = "Sign in",
}: {
  title: string;
  subtitle: string;
  /** a failed resend sends the viewer back to the email step, where the caller shows this */
  onError: (error: string | null) => void;
  onSignedIn?: () => void;
  submitLabel?: string;
}) {
  const { state, actions, mode } = useSession();
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [wait, setWait] = React.useState(RESEND_AFTER_S);
  const { pending, run } = usePending();
  const id = React.useId();
  const email = state.pendingEmail ?? "";

  React.useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  function submit(value: string) {
    return run(async () => {
      const r = await actions.verifyCode(value);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      onSignedIn?.();
    });
  }

  async function resend() {
    setWait(RESEND_AFTER_S);
    setError(null);
    const r = await actions.requestCode(email);
    if (!r.ok) onError(r.error);
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit(code);
      }}
    >
      <button
        type="button"
        onClick={() => actions.clearPendingEmail()}
        className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-line bg-surface px-2 text-xs font-medium text-ink transition-colors duration-(--dur-micro) hover:bg-sunken"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back
      </button>
      <h2 className="mt-4 text-xl text-ink">{title}</h2>
      <p className="mt-1.5 text-sm text-muted">{subtitle}</p>

      <div className="mt-5 flex items-center gap-3 rounded-md border border-line bg-sunken px-3 py-2.5">
        <Avatar name={email || "?"} size={32} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{email}</p>
          <p className="text-xs text-subtle">A 6-digit code is on its way here</p>
        </div>
      </div>

      <Field label="6-digit code" htmlFor={id} error={error} className="mt-4">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            if (v.length === 6) void submit(v);
          }}
          invalid={!!error}
          className="font-mono tracking-[0.3em] tnum"
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </Field>
      {mode === "sample" ? <p className="mt-2 font-mono text-2xs text-subtle">Sample mode: any 6 digits work.</p> : null}
      <Button type="submit" size="lg" className="mt-4 w-full" loading={pending} disabled={code.length !== 6}>
        {submitLabel}
      </Button>
      <p className="mt-3 text-xs text-muted">
        Didn&rsquo;t get it? Check your spam folder, or{" "}
        {wait > 0 ? (
          <span className="text-subtle tnum">send a new one in {wait}s</span>
        ) : (
          <button type="button" onClick={() => void resend()} className="rounded-xs font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
            send a new one
          </button>
        )}
        .
      </p>
    </form>
  );
}
