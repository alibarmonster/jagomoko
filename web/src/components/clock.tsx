"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const ServerNow = createContext<number>(0);

export function ClockProvider({ serverNow, children }: { serverNow: number; children: ReactNode }) {
  return <ServerNow.Provider value={serverNow}>{children}</ServerNow.Provider>;
}

/**
 * Hydration-safe clock. The server render and the first client render both use
 * the server's time (identical markup), then it switches to the client clock
 * and ticks every `tickMs`.
 */
export function useNow(tickMs = 1000): number {
  const serverNow = useContext(ServerNow);
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return now;
}

/** true after the first client effect — for client-only affordances (copy buttons, share). */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
