"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { INITIAL_ROUTER, stepSignInRouter, type RouterState } from "@/lib/sign-in-route";
import { useSession } from "@/components/session";

/**
 * Sends someone into the app right after they sign in on the front page (the rules live in
 * lib/sign-in-route.ts, where they are tested). Renders nothing.
 */
export function SignedInRouter() {
  const s = useSession();
  const router = useRouter();
  const machine = React.useRef<RouterState>(INITIAL_ROUTER);
  const hasRealm = s.state.realm !== null;

  React.useEffect(() => {
    const next = stepSignInRouter(machine.current, { ready: s.ready, signedIn: s.signedIn, hasCharacter: s.hasCharacter, hasRealm });
    machine.current = next.state;
    if (next.to) router.push(next.to);
  }, [s.ready, s.signedIn, s.hasCharacter, hasRealm, router]);

  return null;
}
