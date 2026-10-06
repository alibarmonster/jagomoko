"use client";

/**
 * The creator studio's shared pieces: types, the pure helpers that layer a creator's local moves
 * over indexed data (sample mode), and the hooks every studio screen uses. Two providers fill
 * `useStudio()`:
 *  - studio-sample.tsx: the prototype, everything lives in this browser
 *  - studio-chain.tsx:  real transactions for the realm this account owns
 */

import * as React from "react";
import type { Battle, Quest, World } from "@/lib/data/types";
import type { Usd } from "@/lib/money";
import { sampleAddress } from "@/lib/data/sample";
import { questOutcomes, type Split } from "@/lib/outcomes";
import { safeUrl } from "@/lib/sanitize";
import { useNow } from "@/components/clock";
import { SAMPLE_HANDLE } from "@/lib/config";
import { useSession, type Async, type Result } from "@/components/session";

export const STUDIO_KEY = "jagomoko.sample-studio.v2"; // v2: new 98 / 1 / 1 default split

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

/** 98% to the creator, 1% to the treasury, 1% to the community fund. */
export const DEFAULT_SPLIT: Split = { creatorBps: 9_800, treasuryBps: 100, communityBps: 100 };

export const INITIAL: StudioState = {
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

// ---- the API ------------------------------------------------------------------------------------

export interface StudioApi {
  ready: boolean;
  state: StudioState;
  actions: {
    createQuest: (input: { title: string; minutes: number }) => Async<Result>;
    createBattle: (input: { question: string; sideA: string; sideB: string; minutes: number; pointsMode: boolean }) => Async<Result>;
    reportQuest: (id: string, verdict: "Yes" | "No", proofUrl: string) => Async<Result>;
    reportBattle: (id: string, sideAWon: boolean, proofUrl: string) => Async<Result>;
    finalize: (kind: "q" | "b", id: string) => Async<Result>;
    /** Prototype: pretend the challenge window has already passed. */
    skipWindow: (kind: "q" | "b", id: string) => void;
    queueSplit: (split: Split) => Async<Result>;
    /** Makes a queued split current once its 24 hour notice is over (the sample applies it by itself). */
    applySplit: () => Async<Result>;
    /** `who` is a handle in the sample and an account address (0x...) on the real record. */
    addModerator: (who: string) => Async<Result>;
    removeModerator: (who: string) => Async<Result>;
    /** Moves everything the creator has earned out to their own account. */
    withdraw: () => Async<Result>;
    /**
     * Posts a clip bounty. A reward above zero comes from the creator's own account and is held by
     * the clip board; zero waits for the community to fund it.
     */
    createBounty: (input: { title: string; reward: Usd; clipMinutes: number; voteMinutes: number }) => Async<Result>;
    /** Asks the community treasury to fund clip bounties: a payout to the clip board, voted on like any other. */
    askCommunity: (input: { amount: Usd; description: string }) => Async<Result>;
    /** Adds a passed community payout to a bounty's reward. */
    fundBounty: (bountyId: string, proposalId: string) => Async<Result>;
    /** Sends a community payout that no bounty used back to the treasury. */
    returnPayout: (proposalId: string) => Async<Result>;
    /** Hides spam from the board (or shows it again) until voting ends. */
    hideClip: (clipId: string, hidden: boolean) => Async<Result>;
    /** Pays the winner once voting is over (anyone can). */
    settleBounty: (bountyId: string) => Async<Result>;
    setOverlay: (patch: Partial<StudioState["overlay"]>) => void;
    reset: () => void;
  };
}

export const StudioContext = React.createContext<StudioApi | null>(null);

export function useStudio(): StudioApi {
  const ctx = React.useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used inside <StudioProvider>");
  return ctx;
}

export function validProof(raw: string, required: boolean): { ok: true; url?: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return required ? { ok: false, error: "Add a proof link, like a VOD timestamp." } : { ok: true };
  const url = safeUrl(trimmed);
  if (!url) return { ok: false, error: "Use a full link that starts with https://" };
  return { ok: true, url };
}

/**
 * The realm the studio is showing, when it comes from the live record. The live studio wraps its
 * screens in this; the sample studio does not, and falls back to its own local state.
 */
export const RealmContext = React.createContext<World | null>(null);

/** The split currently in force for tips and quests. */
export function useEffectiveSplit(): Split {
  const world = React.useContext(RealmContext);
  const { state } = useStudio();
  const now = useNow(60_000);
  if (world) return { creatorBps: world.creator.creatorBps, treasuryBps: world.creator.treasuryBps, communityBps: world.creator.communityBps };
  return effectiveSplit(state, now);
}

/** What the settings and overview screens show: the split, a queued change, and the moderators. */
export function useStudioView(): { pendingSplit: { split: Split; effectiveAt: number } | null; moderators: string[]; live: boolean } {
  const world = React.useContext(RealmContext);
  const { state } = useStudio();
  if (world) return { pendingSplit: world.creator.pendingSplit ?? null, moderators: world.creator.moderators ?? [], live: true };
  return { pendingSplit: state.pendingSplit, moderators: state.moderators, live: false };
}

/** The handle of the realm the studio is about: the signed-in streamer's own (live), or the sample's. */
export function useRealmHandle(): string {
  const session = useSession();
  return session.state.realm?.handle ?? SAMPLE_HANDLE;
}
