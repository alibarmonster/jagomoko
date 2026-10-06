"use client";

/**
 * Sample studio. Quests and battles the creator makes, the results they report, split changes and
 * overlay settings, kept locally so the studio and the viewer realm stay consistent across pages.
 */

import * as React from "react";
import type { Battle, Quest } from "@/lib/data/types";
import { load, save } from "@/lib/persist";
import { cleanText, LIMITS, safeUrl } from "@/lib/sanitize";
import {
  CHALLENGE_MS,
  INITIAL,
  STUDIO_KEY,
  StudioContext,
  validProof,
  type StudioApi,
  type StudioState,
} from "./studio-core";

const OK = { ok: true, value: undefined } as const;

/** The sample bounties are a fixed story; changing them needs the live network. */
const sampleOnly = () => ({ ok: false as const, error: "Bounties in the sample can't be changed. Sign in on the live network to post your own." });

export function SampleStudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<StudioState>(INITIAL);
  const [ready, setReady] = React.useState(false);
  const ref = React.useRef(state);
  ref.current = state;

  React.useEffect(() => {
    const loaded = load<Partial<StudioState>>(STUDIO_KEY);
    if (loaded) {
      const merged = { ...INITIAL, ...loaded, overlay: { ...INITIAL.overlay, ...(loaded.overlay ?? {}) } } as StudioState;
      ref.current = merged;
      setState(merged);
    }
    setReady(true);
  }, []);

  const commit = React.useCallback((next: StudioState) => {
    ref.current = next;
    setState(next);
    save(STUDIO_KEY, next);
  }, []);

  const actions = React.useMemo<StudioApi["actions"]>(
    () => ({
      createQuest({ title, minutes }) {
        const t = cleanText(title, LIMITS.title).value;
        if (t.length < 4) return { ok: false, error: "Give the quest a clear title (at least a few words)." };
        const s = ref.current;
        const now = Date.now();
        const quest: Quest = {
          id: String(200 + s.quests.length),
          creatorId: "1",
          title: t,
          goalDeadline: now + minutes * 60_000,
          pool: 0n,
          backers: 0,
          status: "Open",
          proposedVerdict: "None",
          toCreatorVault: 0n,
          toTreasury: 0n,
          refundable: 0n,
          createdAt: now,
        };
        commit({ ...s, quests: [quest, ...s.quests] });
        return OK;
      },

      createBattle({ question, sideA, sideB, minutes, pointsMode }) {
        const q = cleanText(question, LIMITS.title).value;
        const a = cleanText(sideA, LIMITS.side).value;
        const b = cleanText(sideB, LIMITS.side).value;
        if (q.length < 4) return { ok: false, error: "Ask a clear question (at least a few words)." };
        if (!a || !b) return { ok: false, error: "Name both sides." };
        if (a.toLowerCase() === b.toLowerCase()) return { ok: false, error: "The two sides need different names." };
        const s = ref.current;
        const now = Date.now();
        const battle: Battle = {
          id: String(200 + s.battles.length),
          creatorId: "1",
          question: q,
          sideA: a,
          sideB: b,
          closeTime: now + minutes * 60_000,
          pointsMode,
          poolA: 0n,
          poolB: 0n,
          playersA: 0,
          playersB: 0,
          status: "Open",
          proposedVerdict: "None",
          refundAll: false,
          toTreasury: 0n,
          winnings: 0n,
          createdAt: now,
        };
        commit({ ...s, battles: [battle, ...s.battles] });
        return OK;
      },

      reportQuest(id, verdict, proofUrl) {
        const p = validProof(proofUrl, verdict === "Yes");
        if (!p.ok) return { ok: false, error: p.error };
        const s = ref.current;
        commit({ ...s, qReports: { ...s.qReports, [id]: { verdict, proofUrl: p.url, at: Date.now() } } });
        return OK;
      },

      reportBattle(id, sideAWon, proofUrl) {
        const p = validProof(proofUrl, false);
        if (!p.ok) return { ok: false, error: p.error };
        const s = ref.current;
        commit({ ...s, bReports: { ...s.bReports, [id]: { verdict: sideAWon ? "Yes" : "No", proofUrl: p.url, at: Date.now() } } });
        return OK;
      },

      finalize(kind, id) {
        const s = ref.current;
        commit({ ...s, finalized: { ...s.finalized, [`${kind}${id}`]: true } });
        return OK;
      },

      skipWindow(kind, id) {
        const s = ref.current;
        const key = kind === "q" ? "qReports" : "bReports";
        const rep = s[key][id];
        if (!rep) return;
        commit({ ...s, [key]: { ...s[key], [id]: { ...rep, at: rep.at - CHALLENGE_MS - 1_000 } } });
      },

      queueSplit(split) {
        const sum = split.creatorBps + split.treasuryBps + split.communityBps;
        if (sum !== 10_000) return { ok: false, error: "The split has to add up to 100%." };
        if (split.treasuryBps + split.communityBps < 200) return { ok: false, error: "At least 2% has to go to the community." };
        const s = ref.current;
        commit({ ...s, pendingSplit: { split, effectiveAt: Date.now() + 24 * 3_600_000 } });
        return OK;
      },

      addModerator(name) {
        const n = cleanText(name, 42).value;
        if (n.length < 2) return { ok: false, error: "Enter a handle or address." };
        const s = ref.current;
        if (s.moderators.some((m) => m.toLowerCase() === n.toLowerCase())) return { ok: false, error: "They’re already a moderator." };
        if (s.moderators.length >= 10) return { ok: false, error: "That’s the most moderators for now." };
        commit({ ...s, moderators: [...s.moderators, n] });
        return OK;
      },

      removeModerator(name) {
        const s = ref.current;
        commit({ ...s, moderators: s.moderators.filter((m) => m !== name) });
        return OK;
      },

      applySplit() {
        const s = ref.current;
        if (!s.pendingSplit) return OK;
        commit({ ...s, split: s.pendingSplit.split, pendingSplit: null });
        return OK;
      },

      withdraw() {
        return OK; // nothing real to move in the sample
      },

      createBounty: sampleOnly,
      askCommunity: sampleOnly,
      fundBounty: sampleOnly,
      returnPayout: sampleOnly,
      hideClip: sampleOnly,
      settleBounty: sampleOnly,

      setOverlay(patch) {
        const s = ref.current;
        commit({ ...s, overlay: { ...s.overlay, ...patch } });
      },

      reset() {
        commit({ ...INITIAL });
      },
    }),
    [commit],
  );

  const value = React.useMemo(() => ({ ready, state, actions }), [ready, state, actions]);
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}


