"use client";

import * as React from "react";
import { RadioGroup } from "radix-ui";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/money";
import { cleanText, LIMITS } from "@/lib/sanitize";
import { SAMPLE_DATA } from "@/lib/config";
import { ROLES, ROLE_META, type Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { RoleSigil } from "@/components/ui/sigil";
import { PRACTICE_GOLD, useSession } from "@/components/session";

type Step = "email" | "code" | "role" | "gold" | "done";

/**
 * The first five minutes, in one resumable component: email -> code -> pick a
 * role and name -> practice gold. It reads the session to decide which step is
 * next, so closing and reopening a sheet resumes where the viewer left off.
 * No crypto vocabulary: "account", "practice gold", never "wallet".
 */
export function AuthFlow({
  onDone,
  doneLabel = "Continue",
  className,
}: {
  onDone?: () => void;
  doneLabel?: string;
  className?: string;
}) {
  const { state, ready, actions, signedIn, hasCharacter } = useSession();
  const [goldClaimed, setGoldClaimed] = React.useState(false);

  const step: Step = !ready
    ? "email"
    : !signedIn
      ? state.pendingEmail
        ? "code"
        : "email"
      : !hasCharacter
        ? "role"
        : goldClaimed || state.balance > 0n
          ? "done"
          : "gold";

  const index = { email: 1, code: 2, role: 3, gold: 4, done: 4 }[step];

  return (
    <div className={className}>
      <div className="mb-5 flex items-center gap-3" aria-label={`Step ${index} of 4`}>
        <span className="font-mono text-2xs text-subtle tnum">Step {index} of 4</span>
        <span className="flex gap-1" aria-hidden>
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={cn("h-1 w-6 rounded-full", n <= index ? "bg-signal" : "bg-line")} />
          ))}
        </span>
      </div>

      {step === "email" ? <EmailStep /> : null}
      {step === "code" ? <CodeStep /> : null}
      {step === "role" ? <RoleStep /> : null}
      {step === "gold" ? <GoldStep onClaim={() => setGoldClaimed(true)} /> : null}
      {step === "done" ? (
        <div>
          <p className="text-lg text-ink">You&rsquo;re in.</p>
          <p className="mt-1 text-sm text-muted">
            {state.character?.name} the {state.character?.role} has {formatUsd(state.balance, { cents: "always" })} in practice gold.
          </p>
          {onDone ? (
            <Button className="mt-5" size="lg" onClick={onDone}>
              {doneLabel}
              <ArrowRight aria-hidden />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EmailStep() {
  const { actions } = useSession();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const r = actions.requestCode(email);
        setError(r.ok ? null : r.error);
      }}
    >
      <h2 className="text-xl text-ink">Create your character</h2>
      <p className="mt-1.5 text-sm text-muted">No app, no wallet. Just your email.</p>
      <Field label="Email" htmlFor="auth-email" error={error} className="mt-5">
        <Input
          id="auth-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={!!error}
          aria-describedby={error ? "auth-email-error" : undefined}
        />
      </Field>
      <Button type="submit" size="lg" className="mt-4 w-full">
        Send code
      </Button>
    </form>
  );
}

function CodeStep() {
  const { state, actions } = useSession();
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function submit(value: string) {
    const r = actions.verifyCode(value);
    setError(r.ok ? null : r.error);
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(code);
      }}
    >
      <h2 className="text-xl text-ink">Check your email</h2>
      <p className="mt-1.5 text-sm text-muted">
        We sent a 6-digit code to <span className="font-medium text-ink">{state.pendingEmail}</span>.
      </p>
      <Field label="6-digit code" htmlFor="auth-code" error={error} className="mt-5">
        <Input
          id="auth-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            if (v.length === 6) submit(v);
          }}
          invalid={!!error}
          className="font-mono tracking-[0.3em] tnum"
          aria-describedby={error ? "auth-code-error" : undefined}
        />
      </Field>
      {SAMPLE_DATA ? <p className="mt-2 font-mono text-2xs text-subtle">Sample mode: any 6 digits work.</p> : null}
      <Button type="submit" size="lg" className="mt-4 w-full">
        Verify
      </Button>
    </form>
  );
}

function RoleStep() {
  const { actions } = useSession();
  const [role, setRole] = React.useState<Role>("Knight");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const cleaned = cleanText(name, LIMITS.name);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const r = actions.createCharacter(role, name);
        setError(r.ok ? null : r.error);
      }}
    >
      <h2 className="text-xl text-ink">Choose your role</h2>
      <p className="mt-1.5 text-sm text-muted">You can&rsquo;t change this later. It&rsquo;s who you are here.</p>

      <RadioGroup.Root
        value={role}
        onValueChange={(v) => setRole(v as Role)}
        aria-label="Role"
        className="mt-5 grid grid-cols-2 gap-2.5"
      >
        {ROLES.map((r) => (
          <RadioGroup.Item
            key={r}
            value={r}
            className={cn(
              "group flex flex-col items-start rounded-md border border-line-strong bg-surface p-3.5 text-left transition duration-(--dur-micro) ease-out",
              "hover:bg-sunken data-[state=checked]:border-signal data-[state=checked]:bg-signal-tint",
            )}
          >
            <span className="flex w-full items-center justify-between">
              <RoleSigil role={r} className="size-6 text-ink" />
              <span className="hidden size-4 items-center justify-center rounded-full bg-signal text-white group-data-[state=checked]:inline-flex" aria-hidden>
                <Check className="size-3" />
              </span>
            </span>
            <span className="mt-3 text-sm font-medium text-ink">{r}</span>
            <span className="mt-0.5 text-xs text-muted">Earns XP from {ROLE_META[r].earns}</span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <p className="mt-2.5 text-xs text-subtle">{ROLE_META[role].blurb}</p>

      <Field
        label="Character name"
        htmlFor="auth-name"
        error={error}
        counter={`${Array.from(cleaned.value).length}/${LIMITS.name}`}
        hint={cleaned.changed && name.trim() ? `Shown as “${cleaned.value}”` : "This is how everyone sees you."}
        className="mt-5"
      >
        <Input
          id="auth-name"
          autoComplete="nickname"
          placeholder="Alice"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 64))}
          invalid={!!error}
          aria-describedby={error ? "auth-name-error" : "auth-name-hint"}
        />
      </Field>
      <Button type="submit" size="lg" className="mt-4 w-full" disabled={cleaned.value.length === 0}>
        Create {role}
      </Button>
    </form>
  );
}

function GoldStep({ onClaim }: { onClaim: () => void }) {
  const { actions, state } = useSession();
  return (
    <div>
      <h2 className="text-xl text-ink">Here&rsquo;s some practice gold</h2>
      <p className="mt-1.5 text-sm text-muted">
        jagomoko is running on a test network, so there&rsquo;s no real money. We&rsquo;ll add {formatUsd(PRACTICE_GOLD)} to your account so you can try everything.
      </p>
      <div className="mt-5 flex items-center justify-between rounded-md border border-line bg-sunken px-4 py-3">
        <span className="text-sm text-muted">Practice gold</span>
        <span className="font-mono text-base text-ink tnum">{formatUsd(state.balance, { cents: "always" })}</span>
      </div>
      <Button
        size="lg"
        className="mt-4 w-full"
        onClick={() => {
          actions.claimPracticeGold();
          onClaim();
        }}
      >
        Add {formatUsd(PRACTICE_GOLD)} practice gold
      </Button>
    </div>
  );
}
