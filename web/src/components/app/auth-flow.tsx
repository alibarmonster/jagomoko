"use client";

import * as React from "react";
import { RadioGroup } from "radix-ui";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatUsd } from "@/lib/utils/money";
import { cleanText, LIMITS } from "@/lib/utils/sanitize";
import { ROLES, ROLE_META, type Role } from "@/lib/domain/roles";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input } from "@/components/ui/field";
import { Confetti } from "@/components/ui/confetti";
import { Mascot, mascotFor } from "@/components/ui/mascot";
import { motionOff } from "@/lib/utils/motion";
import { PRACTICE_GOLD, useSession } from "@/components/session";
import { useWeb3 } from "@/components/experience";
import { usePending } from "@/hooks/use-pending";
import { AUTH_STEP_NUMBER, authStep } from "@/lib/utils/auth-step";
import { CodeForm, EmailForm } from "./auth-forms";

/**
 * Create your character: email -> code -> pick a role and name -> practice gold, in one resumable
 * component. The step comes from the session (lib/utils/auth-step.ts), so closing and reopening a
 * popup resumes where the viewer left off. No crypto vocabulary: "account", "practice gold", never
 * "wallet". The email and code forms are shared with the Sign in popup (auth-forms.tsx).
 */
export function AuthFlow({
  onDone,
  doneLabel = "Continue",
  role: roleProp,
  onRoleChange,
  className,
}: {
  onDone?: () => void;
  doneLabel?: string;
  /** the role picked so far, when the container shows it too (the popup's art panel) */
  role?: Role;
  onRoleChange?: (role: Role) => void;
  className?: string;
}) {
  const { state, ready, signedIn, hasCharacter } = useSession();
  const [goldClaimed, setGoldClaimed] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [ownRole, setOwnRole] = React.useState<Role>("Knight");
  const role = roleProp ?? ownRole;
  const setRole = (r: Role) => {
    setOwnRole(r);
    onRoleChange?.(r);
  };

  const step = authStep({ ready, signedIn, pendingEmail: state.pendingEmail, hasCharacter, hasGold: goldClaimed || state.balance > 0n });
  const index = AUTH_STEP_NUMBER[step];

  return (
    <div className={className}>
      <div className="mb-5 flex items-center gap-3" aria-label={`Step ${index} of 4`}>
        <span className="font-mono text-2xs text-subtle tnum">Step {index} of 4</span>
        <span className="flex gap-1" aria-hidden>
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={cn("h-1 w-6 rounded-full transition-colors duration-(--dur-ui)", n <= index ? "bg-signal" : "bg-line")} />
          ))}
        </span>
      </div>

      {step === "email" ? (
        <div>
          <h2 className="text-xl text-ink">Create your character</h2>
          <p className="mt-1.5 text-sm text-muted">No app, no wallet. Just your email.</p>
          <div className="mt-5">
            <EmailForm email={email} onEmailChange={setEmail} error={emailError} onError={setEmailError} submitLabel="Send code" />
          </div>
        </div>
      ) : null}
      {step === "code" ? (
        <CodeForm
          title="Check your email"
          subtitle="Type the code we sent you. It signs you in, and your character comes next."
          onError={setEmailError}
          submitLabel="Verify"
        />
      ) : null}
      {step === "loading" ? <SettingUp /> : null}
      {step === "role" ? <RoleStep role={role} onRoleChange={setRole} /> : null}
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

/** Right after a correct code: the account starts in the background for a moment. */
export function SettingUp() {
  return (
    <div className="flex items-center gap-3 py-6" role="status">
      <Loader2 className="size-5 animate-spin text-subtle" aria-hidden />
      <div>
        <p className="text-sm font-medium text-ink">Setting up your account&hellip;</p>
        <p className="text-xs text-subtle">This takes a few seconds, once.</p>
      </div>
    </div>
  );
}

function RoleStep({ role, onRoleChange: setRole }: { role: Role; onRoleChange: (role: Role) => void }) {
  const { actions } = useSession();
  const web3 = useWeb3();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { pending, run } = usePending();
  const cleaned = cleanText(name, LIMITS.name);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const r = await actions.createCharacter(role, name);
          setError(r.ok ? null : r.error);
        });
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
            <span className="flex w-full items-start justify-between">
              {/* the chosen role waves back */}
              <Mascot name={mascotFor(r, r === role ? "wave" : "idle")} height={64} eager />
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
        hint={cleaned.changed && name.trim() ? `Shown as “${cleaned.value}”` : web3 ? "Everyone sees this. It stays off the blockchain, so you can change it later." : "Everyone sees this. You can change it later."}
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
      <Button type="submit" size="lg" className="mt-4 w-full" disabled={cleaned.value.length === 0} loading={pending}>
        Create {role}
      </Button>
    </form>
  );
}

function GoldStep({ onClaim }: { onClaim: () => void }) {
  const { actions, state } = useSession();
  const [error, setError] = React.useState<string | null>(null);
  const [still, setStill] = React.useState(true);
  const { pending, run } = usePending();
  React.useEffect(() => setStill(motionOff()), []);
  const c = state.character;
  return (
    <div>
      {/* the moment a character is born: shown once, right after it is made */}
      {c ? (
        <div className="relative mb-6 flex flex-col items-center text-center">
          {still ? null : <Confetti className="inset-x-0 -top-6 bottom-6" count={18} />}
          <Mascot name={mascotFor(c.role, "cheer")} height={128} eager className={still ? undefined : "animate-alert-pop"} />
          <p className="mt-2 text-lg text-ink">
            {c.name} the {c.role} is here
          </p>
        </div>
      ) : null}
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
        loading={pending}
        onClick={() =>
          run(async () => {
            const r = await actions.claimPracticeGold();
            setError(r.ok ? null : r.error);
            if (r.ok) onClaim();
          })
        }
      >
        Add {formatUsd(PRACTICE_GOLD)} practice gold
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
