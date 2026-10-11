"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** Fired by the session after one of the viewer's own transactions has reached the live record. */
export const DATA_CHANGED_EVENT = "jagomoko:changed";

/**
 * Keeps a live page fresh: re-renders the server data every few seconds while the tab is visible,
 * and straight away after the viewer's own move (their backing, tip or vote should show up now,
 * not at the next tick). Renders nothing.
 */
export function AutoRefresh({ everyMs = 10_000 }: { everyMs?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(tick, everyMs);
    window.addEventListener(DATA_CHANGED_EVENT, tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, tick);
    };
  }, [router, everyMs]);
  return null;
}
