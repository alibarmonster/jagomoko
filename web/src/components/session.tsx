"use client";

/**
 * The session every screen reads through `useSession()`.
 *
 * Two providers fill the same shape (see session-core.ts):
 *  - sample: everything lives in this browser, so the product is explorable offline  (default)
 *  - chain:  real email sign-in and real transactions on Monad testnet with sponsored gas
 *            (NEXT_PUBLIC_CHAIN_MODE=true)
 *
 * The chain provider pulls in Privy, permissionless and viem, so it is loaded lazily: sample mode
 * never downloads any of it.
 */

import * as React from "react";
import { CHAIN_MODE } from "@/lib/config";
import { SampleSessionProvider } from "./session-sample";

export {
  JURY_MIN_LEVEL,
  PRACTICE_GOLD,
  useSession,
  type Async,
  type Result,
  type Reward,
  type SessionApi,
  type SessionCharacter,
} from "./session-core";

const ChainSession = React.lazy(() => import("./session-chain"));

export function SessionProvider({ children }: { children: React.ReactNode }) {
  if (!CHAIN_MODE) return <SampleSessionProvider>{children}</SampleSessionProvider>;
  return (
    <React.Suspense fallback={null}>
      <ChainSession>{children}</ChainSession>
    </React.Suspense>
  );
}
