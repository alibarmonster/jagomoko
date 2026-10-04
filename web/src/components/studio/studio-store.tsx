"use client";

/**
 * The studio store. Every studio screen imports from here; which provider is behind `useStudio()`
 * depends on the mode: the sample (prototype) or real transactions (NEXT_PUBLIC_CHAIN_MODE=true).
 * The chain provider is loaded lazily, so sample mode never downloads it.
 */

import * as React from "react";
import { CHAIN_MODE } from "@/lib/config";
import { SampleStudioProvider } from "./studio-sample";

export * from "./studio-core";

const ChainStudioProvider = React.lazy(() => import("./studio-chain"));

export function StudioProvider({ children }: { children: React.ReactNode }) {
  if (!CHAIN_MODE) return <SampleStudioProvider>{children}</SampleStudioProvider>;
  return (
    <React.Suspense fallback={null}>
      <ChainStudioProvider>{children}</ChainStudioProvider>
    </React.Suspense>
  );
}
