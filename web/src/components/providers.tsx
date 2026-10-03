"use client";

import * as React from "react";
import { ClockProvider } from "@/components/clock";
import { SessionProvider } from "@/components/session";
import { StudioProvider } from "@/components/studio/studio-store";
import { ToastProvider } from "@/components/ui/toast";

export function Providers({ serverNow, children }: { serverNow: number; children: React.ReactNode }) {
  return (
    <ClockProvider serverNow={serverNow}>
      <SessionProvider>
        <StudioProvider>
          <ToastProvider>{children}</ToastProvider>
        </StudioProvider>
      </SessionProvider>
    </ClockProvider>
  );
}
