"use client";

/**
 * Prototype session. Everything a signed-in viewer does (sign in, create a
 * character, practice gold, back, pick, vote) lives in this client store and is
 * persisted in localStorage so the whole product is explorable before the
 * backend exists.
 *
 * INTEGRATION SEAM: the public surface of `useSession()` is what the screens
 * depend on. When Privy + the contracts are wired in, replace the internals of
 * this file (auth -> Privy, balance -> token reads, actions -> transactions) and
 * keep the hook's shape.
 */

import * as React from "react";
import { z } from "zod";
import type { Role } from "@/lib/roles";
import { formatUsd, usd, type Usd } from "@/lib/money";
import { cleanText, LIMITS } from "@/lib/sanitize";
import { load, save } from "@/lib/persist";
import { levelForXp, levelProgress, votingWeight, xpForBack, xpForJoin, xpForTip } from "@/lib/xp";

const STORAGE_KEY = "jagomoko.sample-session.v1";

/** "Practice gold" — the testnet faucet amount. */
export const PRACTICE_GOLD = usd(10);
export const JURY_MIN_LEVEL = 5;

export interface SessionCharacter {
  name: string;
  role: Role;
  xp: bigint;
  /** epoch ms the character was created */
  since: number;
}

export interface Reward {
  xp: bigint;
  levelUp: { from: number; to: number } | null;
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

interface State {
  status: "anonymous" | "authenticated";
  email: string | null;
  pendingEmail: string | null;
  character: SessionCharacter | null;
  balance: Usd;
  backed: Record<string, Usd>;
  picks: Record<string, { side: 0 | 1; amount: Usd }>;
  tips: { amount: Usd; memo: string; at: number }[];
  jury: Record<string, "yes" | "no">;
  proposalVotes: Record<string, boolean>;
  claimed: Record<string, true>;
  disputes: Record<string, true>;
  enlisted: boolean;
  proposals: { id: string; amount: Usd; recipient: string; recipientName: string; description: string; at: number }[];
  xpLog: { at: number; label: string; xp: bigint }[];
}

const INITIAL: State = {
  status: "anonymous",
  email: null,
  pendingEmail: null,
  character: null,
  balance: 0n,
  backed: {},
  picks: {},
  tips: [],
  jury: {},
  proposalVotes: {},
  claimed: {},
  disputes: {},
  enlisted: false,
  proposals: [],
  xpLog: [],
};

// ---- persistence (bigint-safe, see lib/persist) ---------------------------

function hydrate(raw: Partial<State> | null): State | null {
  if (!raw || (raw.status !== "anonymous" && raw.status !== "authenticated")) return null;
  const merged = { ...INITIAL, ...raw } as State;
  if (merged.character && typeof merged.character.since !== "number") merged.character = { ...merged.character, since: Date.now() };
  return merged;
}

// ---- store ------------------------------------------------------------------

interface SessionApi {
  ready: boolean;
  state: State;
  /** Derived */
  signedIn: boolean;
  hasCharacter: boolean;
  level: number;
  progress: ReturnType<typeof levelProgress>;
  weight: bigint;
  canServeOnJury: boolean;
  actions: {
    requestCode: (email: string) => Result;
    verifyCode: (code: string) => Result;
    createCharacter: (role: Role, name: string) => Result;
    claimPracticeGold: () => Usd;
    tip: (amount: Usd, memo: string) => Result<Reward>;
    backQuest: (questId: string, amount: Usd) => Result<Reward>;
    joinBattle: (battleId: string, side: 0 | 1, amount: Usd, pointsMode: boolean) => Result<Reward>;
    voteJury: (caseId: string, vote: "yes" | "no") => Result;
    voteProposal: (proposalId: string, support: boolean) => Result<Reward>;
    toggleEnlist: () => Result<boolean>;
    propose: (amount: Usd, recipient: { id: string; name: string }, description: string) => Result<Reward>;
    claim: (key: string, amount: Usd) => void;
    dispute: (questId: string) => void;
    loadSampleHistory: () => void;
    addSampleXp: (xp: bigint) => Reward;
    signOut: () => void;
  };
}

const SessionContext = React.createContext<SessionApi | null>(null);

export function useSession(): SessionApi {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

const emailSchema = z.string().trim().toLowerCase().max(254).email();

function grant(character: SessionCharacter, xp: bigint): { character: SessionCharacter; reward: Reward } {
  const from = levelForXp(character.xp);
  const next = { ...character, xp: character.xp + xp };
  const to = levelForXp(next.xp);
  return { character: next, reward: { xp, levelUp: to > from ? { from, to } : null } };
}

function needMoney(balance: Usd, amount: Usd): string | null {
  if (balance >= amount) return null;
  return `You need ${formatUsd(amount - balance, { cents: "always" })} more. Top up with practice gold first.`;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>(INITIAL);
  const [ready, setReady] = React.useState(false);
  const ref = React.useRef(state);
  ref.current = state;

  React.useEffect(() => {
    const loaded = hydrate(load<Partial<State>>(STORAGE_KEY));
    if (loaded) {
      ref.current = loaded;
      setState(loaded);
    }
    setReady(true);
  }, []);

  const commit = React.useCallback((next: State) => {
    ref.current = next;
    setState(next);
    save(STORAGE_KEY, next);
  }, []);

  const actions = React.useMemo<SessionApi["actions"]>(() => {
    const logXp = (s: State, label: string, xp: bigint): State["xpLog"] =>
      xp > 0n ? [{ at: Date.now(), label, xp }, ...s.xpLog].slice(0, 40) : s.xpLog;

    return {
      requestCode(email) {
        const parsed = emailSchema.safeParse(email);
        if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
        commit({ ...ref.current, pendingEmail: parsed.data });
        return { ok: true, value: undefined };
      },

      verifyCode(code) {
        // Prototype: any 6 digits are accepted.
        if (!/^\d{6}$/.test(code.trim())) return { ok: false, error: "Enter the 6-digit code." };
        const s = ref.current;
        commit({ ...s, status: "authenticated", email: s.pendingEmail, pendingEmail: null });
        return { ok: true, value: undefined };
      },

      createCharacter(role, rawName) {
        const s = ref.current;
        if (s.character) return { ok: false, error: "You already have a character." };
        const name = cleanText(rawName, LIMITS.name).value;
        if (name.length === 0) return { ok: false, error: "Give your character a name." };
        commit({ ...s, character: { name, role, xp: 0n, since: Date.now() } });
        return { ok: true, value: undefined };
      },

      claimPracticeGold() {
        const s = ref.current;
        commit({ ...s, balance: s.balance + PRACTICE_GOLD });
        return PRACTICE_GOLD;
      },

      tip(amount, memo) {
        const s = ref.current;
        if (!s.character) return { ok: false, error: "Create your character first." };
        const short = needMoney(s.balance, amount);
        if (short) return { ok: false, error: short };
        const { character, reward } = grant(s.character, xpForTip(amount));
        commit({
          ...s,
          character,
          balance: s.balance - amount,
          tips: [{ amount, memo: cleanText(memo, LIMITS.memo).value, at: Date.now() }, ...s.tips].slice(0, 40),
          xpLog: logXp(s, "Tip", reward.xp),
        });
        return { ok: true, value: reward };
      },

      backQuest(questId, amount) {
        const s = ref.current;
        if (!s.character) return { ok: false, error: "Create your character first." };
        const short = needMoney(s.balance, amount);
        if (short) return { ok: false, error: short };
        const { character, reward } = grant(s.character, xpForBack(amount, s.character.role));
        commit({
          ...s,
          character,
          balance: s.balance - amount,
          backed: { ...s.backed, [questId]: (s.backed[questId] ?? 0n) + amount },
          xpLog: logXp(s, "Backed a quest", reward.xp),
        });
        return { ok: true, value: reward };
      },

      joinBattle(battleId, side, amount, pointsMode) {
        const s = ref.current;
        if (!s.character) return { ok: false, error: "Create your character first." };
        const existing = s.picks[battleId];
        if (existing && existing.side !== side) return { ok: false, error: "You already picked the other side." };
        if (pointsMode && existing) return { ok: false, error: "You already joined this battle." };
        if (!pointsMode) {
          const short = needMoney(s.balance, amount);
          if (short) return { ok: false, error: short };
        }
        const { character, reward } = existing
          ? { character: s.character, reward: { xp: 0n, levelUp: null } as Reward }
          : grant(s.character, xpForJoin(s.character.role));
        commit({
          ...s,
          character,
          balance: pointsMode ? s.balance : s.balance - amount,
          picks: { ...s.picks, [battleId]: { side, amount: (existing?.amount ?? 0n) + (pointsMode ? 0n : amount) } },
          xpLog: logXp(s, "Picked a side", reward.xp),
        });
        return { ok: true, value: reward };
      },

      voteJury(caseId, vote) {
        const s = ref.current;
        if (!s.character) return { ok: false, error: "Create your character first." };
        if (s.character.role !== "Judge" || levelForXp(s.character.xp) < JURY_MIN_LEVEL) {
          return { ok: false, error: `Only Judges at level ${JURY_MIN_LEVEL} or higher can serve on a jury.` };
        }
        if (s.jury[caseId]) return { ok: false, error: "You already voted on this case." };
        commit({ ...s, jury: { ...s.jury, [caseId]: vote } });
        return { ok: true, value: undefined };
      },

      voteProposal(proposalId, support) {
        const s = ref.current;
        if (!s.character) return { ok: false, error: "Create your character first." };
        if (votingWeight(s.character.xp) === 0n) {
          return { ok: false, error: "You need some XP to vote. Back a quest or send a tip first." };
        }
        if (proposalId in s.proposalVotes) return { ok: false, error: "You already voted on this proposal." };
        const { character, reward } = grant(s.character, 5n);
        commit({
          ...s,
          character,
          proposalVotes: { ...s.proposalVotes, [proposalId]: support },
          xpLog: logXp(s, "Voted on the treasury", reward.xp),
        });
        return { ok: true, value: reward };
      },

      propose(amount, recipient, rawDescription) {
        const s = ref.current;
        if (!s.character) return { ok: false, error: "Create your character first." };
        if (amount <= 0n) return { ok: false, error: "Enter an amount greater than zero." };
        const description = cleanText(rawDescription, LIMITS.description, { multiline: true }).value;
        if (description.length < 10) return { ok: false, error: "Tell the community what the money is for (at least a sentence)." };
        const { character, reward } = grant(s.character, 10n);
        commit({
          ...s,
          character,
          proposals: [
            { id: String(100 + s.proposals.length), amount, recipient: recipient.id, recipientName: recipient.name, description, at: Date.now() },
            ...s.proposals,
          ].slice(0, 20),
          xpLog: logXp(s, "Proposed a treasury payout", reward.xp),
        });
        return { ok: true, value: reward };
      },

      toggleEnlist() {
        const s = ref.current;
        if (!s.character || s.character.role !== "Judge" || levelForXp(s.character.xp) < JURY_MIN_LEVEL) {
          return { ok: false, error: `Reach level ${JURY_MIN_LEVEL} as a Judge to serve on the jury.` };
        }
        commit({ ...s, enlisted: !s.enlisted });
        return { ok: true, value: !s.enlisted };
      },

      claim(key, amount) {
        const s = ref.current;
        if (s.claimed[key]) return;
        commit({ ...s, balance: s.balance + amount, claimed: { ...s.claimed, [key]: true } });
      },

      dispute(questId) {
        const s = ref.current;
        commit({ ...s, disputes: { ...s.disputes, [questId]: true } });
      },

      loadSampleHistory() {
        // Prototype helper: gives the character a past so claim flows can be explored.
        const s = ref.current;
        if (!s.character) return;
        commit({
          ...s,
          backed: { ...s.backed, "3": usd(10), "4": usd(10) },
          picks: { ...s.picks, "3": { side: 0, amount: usd(10) } },
          xpLog: [{ at: Date.now(), label: "Sample history", xp: 0n }, ...s.xpLog].slice(0, 40),
        });
      },

      addSampleXp(xp) {
        const s = ref.current;
        if (!s.character) return { xp: 0n, levelUp: null };
        const { character, reward } = grant(s.character, xp);
        commit({ ...s, character, xpLog: logXp(s, "Sample XP", xp) });
        return reward;
      },

      signOut() {
        commit({ ...INITIAL });
      },
    };
  }, [commit]);

  const value = React.useMemo<SessionApi>(() => {
    const xp = state.character?.xp ?? 0n;
    const progress = levelProgress(xp);
    return {
      ready,
      state,
      signedIn: state.status === "authenticated",
      hasCharacter: state.character !== null,
      level: progress.level,
      progress,
      weight: votingWeight(xp),
      canServeOnJury: state.character?.role === "Judge" && progress.level >= JURY_MIN_LEVEL,
      actions,
    };
  }, [state, ready, actions]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
