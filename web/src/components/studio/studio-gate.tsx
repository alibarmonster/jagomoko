"use client";

import * as React from "react";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { useSession } from "@/components/session";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/sigil";
import { OpenRealm } from "./open-realm";

function GateFrame({ children }: { children: React.ReactNode }) {
  const s = useSession();
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line">
        <div className="container-page flex h-14 items-center justify-between">
          <Link href={routes.home} className="rounded-sm" aria-label="jagomoko home">
            <Wordmark />
          </Link>
          {s.signedIn ? (
            <Button variant="ghost" size="sm" onClick={() => s.actions.signOut()}>
              Sign out
            </Button>
          ) : null}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-xl px-4 py-10 md:py-16">
        {children}
      </main>
    </div>
  );
}

/**
 * The creator studio is for streamers who have opened a realm. In chain mode it checks, in order:
 * signed in? has a realm? Only then does the studio itself show. (Sample mode is always open.)
 */
export function StudioGate({ children }: { children: React.ReactNode }) {
  const s = useSession();
  if (s.mode === "sample") return <>{children}</>;

  if (!s.ready) {
    return (
      <GateFrame>
        <div className="h-64 animate-pulse-soft rounded-md bg-sunken" aria-busy="true" />
      </GateFrame>
    );
  }

  if (!s.signedIn) {
    return (
      <GateFrame>
        <p className="font-mono text-2xs text-subtle">Creator studio</p>
        <h1 className="mt-2 text-2xl text-ink">Open your realm</h1>
        <p className="mt-2 text-base text-muted">
          Sign in with your email to open your realm and start your first quest. No app, no wallet. Just your email.
        </p>
        <Button size="lg" className="mt-6 w-full" onClick={() => s.actions.openSignIn()}>
          Continue with email
        </Button>
        <p className="mt-4 text-xs text-muted">
          Here to watch and play instead? <Link href={routes.home} className="underline decoration-line-strong underline-offset-2 hover:text-ink">Back to the front page</Link>.
        </p>
      </GateFrame>
    );
  }

  if (!s.state.realm) {
    return (
      <GateFrame>
        <OpenRealm />
      </GateFrame>
    );
  }

  return <>{children}</>;
}
