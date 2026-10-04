"use client";

/**
 * Sample session. Everything a signed-in viewer does (sign in, create a character, practice gold,
 * back, pick, vote) lives in this client store and is persisted in localStorage, so the whole
 * product is explorable without a wallet, a network or a deployed contract.
 */

import * as React from "react";
import { z } from "zod";
import { usd } from "@/lib/money";
import { cleanText, LIMITS } from "@/lib/sanitize";
import { load, save } from "@/lib/persist";
import { levelForXp, votingWeight, xpForBack, xpForJoin, xpForTip } from "@/lib/xp";
import {
  deriveApi,
  grant,
  hydrate,
  INITIAL,
  JURY_MIN_LEVEL,
  needMoney,
  PRACTICE_GOLD,
  SessionContext,
  type Reward,
  type SessionActions,
  type SessionApi,
  type State,
} from "./session-core";

const STORAGE_KEY = "jagomoko.sample-session.v1";

const emailSchema = z.string().trim().toLowerCase().max(254).email();
const OK = { ok: true, value: undefined } as const;

export function SampleSessionProvider({ children }: { children: React.ReactNode }) {
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

  const actions = React.useMemo<SessionActions>(() => {
    const logXp = (s: State, label: string, xp: bigint): State["xpLog"] =>
      xp > 0n ? [{ at: Date.now(), label, xp }, ...s.xpLog].slice(0, 40) : s.xpLog;

    return {
      requestCode(email) {
        const parsed = emailSchema.safeParse(email);
        if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
        commit({ ...ref.current, pendingEmail: parsed.data });
        return OK;
      },

      verifyCode(code) {
        // Prototype: any 6 digits are accepted.
        if (!/^\d{6}$/.test(code.trim())) return { ok: false, error: "Enter the 6-digit code." };
        const s = ref.current;
        commit({ ...s, status: "authenticated", email: s.pendingEmail, pendingEmail: null });
        return OK;
      },

      createCharacter(role, rawName) {
        const s = ref.current;
        if (s.character) return { ok: false, error: "You already have a character." };
        const name = cleanText(rawName, LIMITS.name).value;
        if (name.length === 0) return { ok: false, error: "Give your character a name." };
        commit({ ...s, character: { name, role, xp: 0n, since: Date.now() } });
        return OK;
      },

      claimPracticeGold() {
        const s = ref.current;
        commit({ ...s, balance: s.balance + PRACTICE_GOLD });
        return { ok: true, value: PRACTICE_GOLD };
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
        return OK;
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
        if (s.claimed[key]) return OK;
        commit({ ...s, balance: s.balance + amount, claimed: { ...s.claimed, [key]: true } });
        return OK;
      },

      dispute(questId) {
        const s = ref.current;
        commit({ ...s, disputes: { ...s.disputes, [questId]: true } });
        return OK;
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

  const refresh = React.useCallback(async () => {}, []);
  const value = React.useMemo<SessionApi>(
    () => deriveApi({ mode: "sample", ready, state, address: null, refresh, actions }),
    [state, ready, refresh, actions],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
