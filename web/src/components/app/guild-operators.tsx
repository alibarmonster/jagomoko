"use client";

import * as React from "react";
import { useSession } from "@/components/session";

/**
 * Who runs the guild on screen: its streamer and moderators. They report the results, so the
 * contracts keep them from playing in their own guild (no picks, no clips); the screens lock those
 * buttons for them instead of letting a transaction fail.
 */
const GuildOperators = React.createContext<{ owner?: string; moderators?: string[] }>({});

export function GuildOperatorsProvider({ owner, moderators, children }: { owner: string; moderators?: string[]; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ owner, moderators }), [owner, moderators]);
  return <GuildOperators.Provider value={value}>{children}</GuildOperators.Provider>;
}

/** True when the signed-in account is this guild's streamer or one of its moderators. */
export function useIsGuildOperator(): boolean {
  const s = useSession();
  const { owner, moderators } = React.useContext(GuildOperators);
  const me = s.address?.toLowerCase();
  if (!me) return false;
  return owner?.toLowerCase() === me || (moderators ?? []).some((m) => m.toLowerCase() === me);
}
