"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { LogoMark } from "@/components/ui/sigil";
import { Mascot } from "@/components/ui/mascot";
import { useSession } from "@/components/session";
import { CodeForm, EmailForm } from "./auth-forms";
import { SettingUp } from "./auth-flow";

/**
 * Sign in for someone who has been here before: the email, then the code, and nothing else (no
 * role, no step counter). Used in the Sign in popup and inline on the studio's front door.
 */
export function SignInForm({
  title = "Sign in to jagomoko",
  subtitle = "Welcome back. We’ll email you a 6-digit code, no password needed.",
  onSignedIn,
  className,
}: {
  title?: string;
  subtitle?: string;
  /** right after a correct code (the account may still be starting) */
  onSignedIn?: () => void;
  className?: string;
}) {
  const { state, signedIn } = useSession();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const onCode = !signedIn && !!state.pendingEmail;

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-start justify-between pr-8">
        <span className="inline-flex size-10 items-center justify-center rounded-md border border-line bg-surface shadow-sm">
          <LogoMark />
        </span>
        <Mascot name="moko-hello" height={60} eager className="-mb-2 -mt-2 animate-mascot-bob" />
      </div>

      {signedIn ? (
        <SettingUp />
      ) : onCode ? (
        <div className="mt-5">
          <CodeForm title="Check your email" subtitle="Type the 6-digit code to sign in." onError={setError} onSignedIn={onSignedIn} />
        </div>
      ) : (
        <div className="mt-5">
          <h2 className="text-xl text-ink">{title}</h2>
          <p className="mt-1.5 mb-5 text-sm text-muted">{subtitle}</p>
          <EmailForm email={email} onEmailChange={setEmail} error={error} onError={setError} />
        </div>
      )}
    </div>
  );
}
