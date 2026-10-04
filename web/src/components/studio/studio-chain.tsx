"use client";

/**
 * Chain studio: every action is a real transaction against the realm this account owns, sent as one
 * sponsored batch (see lib/aa). The streamer never pays or sees a fee. After each action it waits for
 * the live record to reach that transaction, then tells every live screen to refresh.
 *
 * What a studio screen SHOWS (quests, battles, balances, the split) comes from the live record;
 * this provider only holds what is not on chain, the overlay look.
 */

import * as React from "react";
import { isAddress } from "viem";
import { createCalls, toId, type Call } from "@/lib/chain/calls";
import { CONTRACTS } from "@/lib/chain/config";
import { waitForIndexer } from "@/lib/data/client";
import { load, save } from "@/lib/persist";
import { cleanText, LIMITS } from "@/lib/sanitize";
import { DATA_CHANGED_EVENT } from "@/components/app/auto-refresh";
import { useSession, type Result } from "@/components/session";
import { INITIAL, StudioContext, validProof, type StudioApi, type StudioState } from "./studio-core";

const calls = createCalls(CONTRACTS);
const OVERLAY_KEY = "jagomoko.chain-studio.overlay.v1";
const fail =(error: string): { ok: false; error: string } => ({ ok: false, error });

export default function ChainStudioProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [overlay, setOverlay] = React.useState<StudioState["overlay"]>(INITIAL.overlay);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const saved = load<Partial<StudioState["overlay"]>>(OVERLAY_KEY);
    if (saved) setOverlay({ ...INITIAL.overlay, ...saved });
    setReady(true);
  }, []);

  // the actions are created once and read the latest session through a ref
  const latest = React.useRef({ realm: session.state.realm, address: session.address, send: session.send, refresh: session.refresh });
  latest.current = { realm: session.state.realm, address: session.address, send: session.send, refresh: session.refresh };

  const actions = React.useMemo<StudioApi["actions"]>(() => {
    const realmId = (): bigint | null => {
      const r = latest.current.realm;
      return r ? toId(r.creatorId) : null;
    };

    /** Sends one sponsored batch, waits for the live record, and refreshes every live screen. */
    async function run(list: Call[]): Promise<Result> {
      const sent = await latest.current.send(list);
      if (!sent.ok) return sent;
      await waitForIndexer(sent.value.blockNumber);
      await latest.current.refresh();
      window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
      return { ok: true, value: undefined, tx: sent.value.hash };
    }

    const needRealm = "Open your realm first.";

    return {
      async createQuest({ title, minutes }) {
        const t = cleanText(title, LIMITS.title).value;
        if (t.length < 4) return fail("Give the quest a clear title (at least a few words).");
        const id = realmId();
        if (id === null) return fail(needRealm);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.round(minutes * 60));
        return run(calls.createQuest(id, t, deadline));
      },

      async createBattle({ question, sideA, sideB, minutes, pointsMode }) {
        const q = cleanText(question, LIMITS.title).value;
        const a = cleanText(sideA, LIMITS.side).value;
        const b = cleanText(sideB, LIMITS.side).value;
        if (q.length < 4) return fail("Ask a clear question (at least a few words).");
        if (!a || !b) return fail("Name both sides.");
        if (a.toLowerCase() === b.toLowerCase()) return fail("The two sides need different names.");
        const id = realmId();
        if (id === null) return fail(needRealm);
        const closeTime = BigInt(Math.floor(Date.now() / 1000) + Math.round(minutes * 60));
        return run(calls.createBattle(id, q, a, b, closeTime, pointsMode));
      },

      async reportQuest(rawId, verdict, proofUrl) {
        const proof = validProof(proofUrl, verdict === "Yes");
        if (!proof.ok) return fail(proof.error);
        const id = toId(rawId);
        if (id === null) return fail("We couldn't find that quest.");
        return run(calls.proposeQuestOutcome(id, verdict === "Yes", proof.url ?? ""));
      },

      async reportBattle(rawId, sideAWon, proofUrl) {
        const proof = validProof(proofUrl, false);
        if (!proof.ok) return fail(proof.error);
        const id = toId(rawId);
        if (id === null) return fail("We couldn't find that battle.");
        return run(calls.proposeBattleOutcome(id, sideAWon, proof.url ?? ""));
      },

      async finalize(kind, rawId) {
        const id = toId(rawId);
        if (id === null) return fail("We couldn't find that.");
        return run(kind === "q" ? calls.finalizeQuest(id) : calls.finalizeBattle(id));
      },

      skipWindow() {
        // the challenge window is enforced by the contract: there is nothing to skip
      },

      async queueSplit(split) {
        if (split.creatorBps + split.treasuryBps + split.communityBps !== 10_000) return fail("The split has to add up to 100%.");
        if (split.treasuryBps + split.communityBps < 200) return fail("At least 2% has to go to the community.");
        const id = realmId();
        if (id === null) return fail(needRealm);
        return run(calls.queueSplit(id, split));
      },

      async applySplit() {
        const id = realmId();
        if (id === null) return fail(needRealm);
        return run(calls.applySplit(id));
      },

      async addModerator(who) {
        const address = who.trim();
        if (!isAddress(address, { strict: false })) return fail("Enter their account address. It starts with 0x.");
        const id = realmId();
        if (id === null) return fail(needRealm);
        return run(calls.setModerator(id, address, true));
      },

      async removeModerator(who) {
        if (!isAddress(who, { strict: false })) return fail("We couldn't find that moderator.");
        const id = realmId();
        if (id === null) return fail(needRealm);
        return run(calls.setModerator(id, who, false));
      },

      async withdraw() {
        const id = realmId();
        const to = latest.current.address;
        if (id === null) return fail(needRealm);
        if (!to || !isAddress(to)) return fail("Your account is still starting. Try again in a moment.");
        return run(calls.withdrawEarnings(id, to));
      },

      setOverlay(patch) {
        setOverlay((current) => {
          const next = { ...current, ...patch };
          save(OVERLAY_KEY, next);
          return next;
        });
      },

      reset() {},
    };
  }, []);

  const state = React.useMemo<StudioState>(() => ({ ...INITIAL, overlay }), [overlay]);
  const value = React.useMemo<StudioApi>(() => ({ ready, state, actions }), [ready, state, actions]);
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
