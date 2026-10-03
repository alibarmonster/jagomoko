"use client";

/**
 * Prototype creator state: quests and battles the creator makes, the results
 * they report, split changes and overlay settings. Persisted locally so the
 * studio and the viewer realm stay consistent across pages.
 *
 * INTEGRATION SEAM: replace with contract writes (createQuest, proposeOutcome,
 * finalize, queueSplit...) and indexer reads; keep `useStudio()`'s shape.
 */

import * as React from "react";
import type { Battle, Quest } from "@/lib/data/types";
import { sampleAddress } from "@/lib/data/sample";
import { load, save } from "@/lib/persist";
import { questOutcomes, type Split } from "@/lib/outcomes";
import { cleanText, LIMITS, safeUrl } from "@/lib/sanitize";
import { useNow } from "@/components/clock";
import type { Result } from "@/components/session";

const KEY = "jagomoko.sample-studio.v1";

/** How long backers have to dispute a reported result. */
export const CHALLENGE_MS = 10 * 60_000;

export type AnchorPos = "bottom-left" | "bottom-right" | "top-right";

export interface Report {
  verdict: "Yes" | "No";
  proofUrl?: string;
  at: number;
}

export interface StudioState {
  quests: Quest[];
  battles: Battle[];
  qReports: Record<string, Report>;
  bReports: Record<string, Report>;
  finalized: Record<string, true>;
  split: Split;
  pendingSplit: { split: Split; effectiveAt: number } | null;
  moderators: string[];
  overlay: { anchor: AnchorPos; reducedMotion: boolean };
}

export const DEFAULT_SPLIT: Split = { creatorBps: 8_000, treasuryBps: 1_500, communityBps: 500 };

const INITIAL: StudioState = {
  quests: [],
  battles: [],
  qReports: {},
  bReports: {},
  finalized: {},
  split: DEFAULT_SPLIT,
  pendingSplit: null,
  moderators: ["Marlowe"],
  overlay: { anchor: "bottom-left", reducedMotion: false },
};

const OWNER = sampleAddress("neonblade-owner");

// ---- pure helpers shared by the studio and the viewer realm ------------------

/** Created quests first, then the indexed ones, with reported/finalized results layered on. */
export function resolveQuests(base: Quest[], st: StudioState, now: number): Quest[] {
  return [...st.quests, ...base].map((q) => {
    const rep = st.qReports[q.id];
    if (!rep) return q;
    const proofUrl = rep.proofUrl ? safeUrl(rep.proofUrl) : undefined;
    if (st.finalized[`q${q.id}`]) {
      const o = questOutcomes(q.pool, st.split);
      return rep.verdict === "Yes"
        ? { ...q, status: "Succeeded", proposedVerdict: "Yes", proofUrl, toCreatorVault: q.pool, resolvedAt: now }
        : { ...q, status: "Failed", proposedVerdict: "No", proofUrl, toTreasury: o.failed.toTreasury, refundable: o.failed.refund, resolvedAt: now };
    }
    return {
      ...q,
      status: "Proposed",
      proposedVerdict: rep.verdict,
      proposer: OWNER,
      proofUrl,
      challengeDeadline: rep.at + CHALLENGE_MS,
    };
  });
}

export function resolveBattles(base: Battle[], st: StudioState, now: number): Battle[] {
  return [...st.battles, ...base].map((b) => {
    const rep = st.bReports[b.id];
    if (!rep) return b;
    const proofUrl = rep.proofUrl ? safeUrl(rep.proofUrl) : undefined;
    if (st.finalized[`b${b.id}`]) {
      const refundAll = b.poolA === 0n || b.poolB === 0n;
      const losing = rep.verdict === "Yes" ? b.poolB : b.poolA;
      const cut = refundAll ? 0n : (losing * 200n) / 10_000n;
      return {
        ...b,
        status: rep.verdict === "Yes" ? "Succeeded" : "Failed",
        proposedVerdict: rep.verdict,
        proofUrl,
        refundAll,
        toTreasury: cut,
        winnings: refundAll ? 0n : losing - cut,
        resolvedAt: now,
      };
    }
    return { ...b, status: "Proposed", proposedVerdict: rep.verdict, proposer: OWNER, proofUrl, challengeDeadline: rep.at + CHALLENGE_MS };
  });
}

/** An applied split once its 24h timelock has passed. */
export function effectiveSplit(st: StudioState, now: number): Split {
  return st.pendingSplit && now >= st.pendingSplit.effectiveAt ? st.pendingSplit.split : st.split;
}

// ---- store ----------------------------------------------------------------------

interface StudioApi {
  ready: boolean;
  state: StudioState;
  actions: {
    createQuest: (input: { title: string; minutes: number }) => Result<Quest>;
    createBattle: (input: { question: string; sideA: string; sideB: string; minutes: number; pointsMode: boolean }) => Result<Battle>;
    reportQuest: (id: string, verdict: "Yes" | "No", proofUrl: string) => Result;
    reportBattle: (id: string, sideAWon: boolean, proofUrl: string) => Result;
    finalize: (kind: "q" | "b", id: string) => void;
    /** Prototype: pretend the challenge window has already passed. */
    skipWindow: (kind: "q" | "b", id: string) => void;
    queueSplit: (split: Split) => Result;
    addModerator: (name: string) => Result;
    removeModerator: (name: string) => void;
    setOverlay: (patch: Partial<StudioState["overlay"]>) => void;
    reset: () => void;
  };
}

const StudioContext = React.createContext<StudioApi | null>(null);

export function useStudio(): StudioApi {
  const ctx = React.useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used inside <StudioProvider>");
  return ctx;
}

function validProof(raw: string, required: boolean): { ok: true; url?: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return required ? { ok: false, error: "Add a proof link, like a VOD timestamp." } : { ok: true };
  const url = safeUrl(trimmed);
  if (!url) return { ok: false, error: "Use a full link that starts with https://" };
  return { ok: true, url };
}

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<StudioState>(INITIAL);
  const [ready, setReady] = React.useState(false);
  const ref = React.useRef(state);
  ref.current = state;

  React.useEffect(() => {
    const loaded = load<Partial<StudioState>>(KEY);
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
    save(KEY, next);
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
        return { ok: true, value: quest };
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
        return { ok: true, value: battle };
      },

      reportQuest(id, verdict, proofUrl) {
        const p = validProof(proofUrl, verdict === "Yes");
        if (!p.ok) return { ok: false, error: p.error };
        const s = ref.current;
        commit({ ...s, qReports: { ...s.qReports, [id]: { verdict, proofUrl: p.url, at: Date.now() } } });
        return { ok: true, value: undefined };
      },

      reportBattle(id, sideAWon, proofUrl) {
        const p = validProof(proofUrl, false);
        if (!p.ok) return { ok: false, error: p.error };
        const s = ref.current;
        commit({ ...s, bReports: { ...s.bReports, [id]: { verdict: sideAWon ? "Yes" : "No", proofUrl: p.url, at: Date.now() } } });
        return { ok: true, value: undefined };
      },

      finalize(kind, id) {
        const s = ref.current;
        commit({ ...s, finalized: { ...s.finalized, [`${kind}${id}`]: true } });
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
        if (split.treasuryBps + split.communityBps < 1_000) return { ok: false, error: "At least 10% has to go to the community." };
        const s = ref.current;
        commit({ ...s, pendingSplit: { split, effectiveAt: Date.now() + 24 * 3_600_000 } });
        return { ok: true, value: undefined };
      },

      addModerator(name) {
        const n = cleanText(name, 42).value;
        if (n.length < 2) return { ok: false, error: "Enter a handle or address." };
        const s = ref.current;
        if (s.moderators.some((m) => m.toLowerCase() === n.toLowerCase())) return { ok: false, error: "They’re already a moderator." };
        if (s.moderators.length >= 10) return { ok: false, error: "That’s the most moderators for now." };
        commit({ ...s, moderators: [...s.moderators, n] });
        return { ok: true, value: undefined };
      },

      removeModerator(name) {
        const s = ref.current;
        commit({ ...s, moderators: s.moderators.filter((m) => m !== name) });
      },

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


/** The split currently in force for tips and quests (a queued change applies after its 24h timelock). */
export function useEffectiveSplit(): Split {
  const { state } = useStudio();
  const now = useNow(60_000);
  return effectiveSplit(state, now);
}
