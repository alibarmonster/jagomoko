"use client";

/**
 * Chain session: real email sign-in (Privy) and real transactions on Monad testnet.
 *
 * - Sign-in is a one-time code by email. Privy creates an embedded wallet; that wallet owns a smart
 *   account; gas for everything below is sponsored (see lib/aa and /api/aa). No wallet screens, no fees.
 * - Balance, character, XP and jury status are READ from the chain, so they are always true.
 * - What the indexer will eventually provide (which quests I backed, my picks, my votes) is mirrored
 *   locally per account for now, so the screens keep working until the live feed is connected.
 */

import * as React from "react";
import { PrivyProvider, useLoginWithEmail, usePrivy, type PrivyClientConfig } from "@privy-io/react-auth";
import { isAddress, type Hash } from "viem";
import { z } from "zod";
import { cleanText, LIMITS } from "@/lib/sanitize";
import { load, save } from "@/lib/persist";
import { createCalls, toId, type Call } from "@/lib/chain/calls";
import { CONTRACTS, DEPLOYED, monadTestnet, REALM_CREATOR_ID } from "@/lib/chain/config";
import { friendlyError } from "@/lib/chain/errors";
import { readViewer, type ViewerChainState } from "@/lib/chain/reads";
import { useSmartAccount } from "@/lib/aa/use-smart-account";
import {
  deriveApi,
  INITIAL,
  needMoney,
  PRACTICE_GOLD,
  rewardBetween,
  SessionContext,
  type Result,
  type SessionActions,
  type SessionApi,
  type SessionCharacter,
  type State,
} from "./session-core";

const calls = createCalls(CONTRACTS);

const PRIVY_CONFIG: PrivyClientConfig = {
  loginMethods: ["email"],
  defaultChain: monadTestnet,
  supportedChains: [monadTestnet],
  // the embedded wallet is created silently and never shows a prompt: the viewer only ever sees the game
  embeddedWallets: { ethereum: { createOnLogin: "all-users" }, showWalletUIs: false },
  appearance: { theme: "light" },
};

const emailSchema = z.string().trim().toLowerCase().max(254).email();
const OK = { ok: true, value: undefined } as const;
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** What the chain cannot tell us yet: the viewer's own history, until the indexer provides it. */
type Mirror = Pick<State, "backed" | "picks" | "tips" | "jury" | "proposalVotes" | "claimed" | "disputes" | "proposals" | "xpLog"> & {
  /** when the character was first seen (the contract does not store a creation time) */
  since: number | null;
};

const EMPTY_MIRROR: Mirror = {
  backed: {},
  picks: {},
  tips: [],
  jury: {},
  proposalVotes: {},
  claimed: {},
  disputes: {},
  proposals: [],
  xpLog: [],
  since: null,
};

const mirrorKey = (userId: string) => `jagomoko.chain-mirror.v1.${userId}`;

/** The session needs a Privy app id. Say so plainly instead of crashing. */
function SetupNotice() {
  return (
    <main className="container-page py-24">
      <p className="font-mono text-xs text-subtle">Chain mode</p>
      <h1 className="mt-2 text-xl font-semibold text-ink">Sign-in isn&rsquo;t set up yet</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Add <code className="font-mono">NEXT_PUBLIC_PRIVY_APP_ID</code> to <code className="font-mono">web/.env</code> and restart the dev server, or set{" "}
        <code className="font-mono">NEXT_PUBLIC_CHAIN_MODE=false</code> to explore with sample data.
      </p>
    </main>
  );
}

export default function ChainSession({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <SetupNotice />;
  return (
    <PrivyProvider appId={appId} config={PRIVY_CONFIG}>
      <ChainSessionInner>{children}</ChainSessionInner>
    </PrivyProvider>
  );
}

const toCharacter = (data: ViewerChainState | null, since: number | null): SessionCharacter | null =>
  data?.character ? { ...data.character, since: since ?? Date.now() } : null;

function ChainSessionInner({ children }: { children: React.ReactNode }) {
  const privy = usePrivy();
  const login = useLoginWithEmail();
  const account = useSmartAccount();

  const userId = privy.user?.id ?? null;
  const address = account.state.status === "ready" ? account.state.account.address : null;

  const [mirror, setMirror] = React.useState<Mirror>(EMPTY_MIRROR);
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);
  const [chain, setChain] = React.useState<{ loaded: boolean; data: ViewerChainState | null }>({ loaded: false, data: null });

  // the actions below are created once and read the latest values through refs
  const latest = React.useRef({ mirror, chain: chain.data, address, userId, login, logout: privy.logout });
  latest.current = { mirror, chain: chain.data, address, userId, login, logout: privy.logout };

  // ---- the local mirror, per account ------------------------------------------------------------
  React.useEffect(() => {
    setMirror(userId ? (load<Mirror>(mirrorKey(userId)) ?? EMPTY_MIRROR) : EMPTY_MIRROR);
  }, [userId]);

  const commitMirror = React.useCallback((update: (m: Mirror) => Mirror) => {
    const next = update(latest.current.mirror);
    latest.current.mirror = next;
    setMirror(next);
    if (latest.current.userId) save(mirrorKey(latest.current.userId), next);
  }, []);

  // ---- what the chain says -----------------------------------------------------------------------
  const refresh = React.useCallback(async () => {
    const who = latest.current.address;
    if (!who || !DEPLOYED) return;
    try {
      const data = await readViewer(who);
      latest.current.chain = data;
      setChain({ loaded: true, data });
    } catch {
      // keep the last known state; the next refresh tries again
      setChain((c) => (c.loaded ? c : { loaded: true, data: null }));
    }
  }, []);

  React.useEffect(() => {
    if (!address) {
      setChain({ loaded: false, data: null });
      return;
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [address, refresh]);

  // the first time a character shows up, remember when (the contract does not store it)
  React.useEffect(() => {
    if (chain.data?.character && mirror.since === null) commitMirror((m) => ({ ...m, since: Date.now() }));
  }, [chain.data?.character, mirror.since, commitMirror]);

  // ---- actions ------------------------------------------------------------------------------------
  const whenReady = account.whenReady;

  const actions = React.useMemo<SessionActions>(() => {
    const snapshot = (d: ViewerChainState | null) => ({ b: d?.balance ?? 0n, x: d?.character?.xp ?? 0n, c: d?.character !== null && d?.character !== undefined, e: d?.enlisted ?? false });
    const changed = (a: ViewerChainState | null, b: ViewerChainState | null) => {
      const [p, q] = [snapshot(a), snapshot(b)];
      return p.b !== q.b || p.x !== q.x || p.c !== q.c || p.e !== q.e;
    };

    /** Sends one sponsored batch. Never throws: a problem becomes a plain sentence. */
    async function send(list: Call[]): Promise<Result<Hash>> {
      if (!DEPLOYED) return fail("This isn't switched on yet.");
      try {
        const viewer = await whenReady();
        return { ok: true, value: await viewer.send(list) };
      } catch (error) {
        return fail(friendlyError(error));
      }
    }

    /**
     * After a transaction: re-read the chain and report what changed. A read can land a block behind
     * the receipt, so when we expect a change we look again a few times before giving up.
     */
    async function settle(expectChange: boolean) {
      const before = latest.current.chain;
      for (let attempt = 0; attempt < 5; attempt++) {
        await refresh();
        if (!expectChange || changed(before, latest.current.chain)) break;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      return rewardBetween(toCharacter(before, null), toCharacter(latest.current.chain, null));
    }

    const log = (label: string, xp: bigint) => (m: Mirror): Mirror =>
      xp > 0n ? { ...m, xpLog: [{ at: Date.now(), label, xp }, ...m.xpLog].slice(0, 40) } : m;

    const balance = () => latest.current.chain?.balance ?? 0n;
    const needCharacter = () => (latest.current.chain?.character ? null : "Create your character first.");

    return {
      async requestCode(email) {
        const parsed = emailSchema.safeParse(email);
        if (!parsed.success) return fail("Enter a valid email address.");
        try {
          await latest.current.login.sendCode({ email: parsed.data });
        } catch (error) {
          return fail(friendlyError(error));
        }
        setPendingEmail(parsed.data);
        return OK;
      },

      async verifyCode(code) {
        if (!/^\d{6}$/.test(code.trim())) return fail("Enter the 6-digit code.");
        try {
          await latest.current.login.loginWithCode({ code: code.trim() });
        } catch (error) {
          return fail(friendlyError(error));
        }
        setPendingEmail(null);
        return OK;
      },

      async createCharacter(role, rawName) {
        const name = cleanText(rawName, LIMITS.name).value;
        if (name.length === 0) return fail("Give your character a name.");
        const sent = await send(calls.mintCharacter(role, name));
        if (!sent.ok) return sent;
        await settle(true);
        commitMirror((m) => ({ ...m, since: Date.now() }));
        return OK;
      },

      async claimPracticeGold() {
        const sent = await send(calls.faucet());
        if (!sent.ok) return sent;
        await settle(true);
        return { ok: true, value: PRACTICE_GOLD };
      },

      async tip(amount, memo) {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const short = needMoney(balance(), amount);
        if (short) return fail(short);
        const cleaned = cleanText(memo, LIMITS.memo).value;
        const sent = await send(calls.tip(REALM_CREATOR_ID, amount, cleaned));
        if (!sent.ok) return sent;
        const reward = await settle(true);
        commitMirror((m) => ({ ...log("Tip", reward.xp)(m), tips: [{ amount, memo: cleaned, at: Date.now() }, ...m.tips].slice(0, 40) }));
        return { ok: true, value: reward };
      },

      async backQuest(questId, amount) {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const id = toId(questId);
        if (id === null) return fail("We couldn't find that quest.");
        const short = needMoney(balance(), amount);
        if (short) return fail(short);
        const sent = await send(calls.backQuest(id, amount));
        if (!sent.ok) return sent;
        const reward = await settle(true);
        commitMirror((m) => ({ ...log("Backed a quest", reward.xp)(m), backed: { ...m.backed, [questId]: (m.backed[questId] ?? 0n) + amount } }));
        return { ok: true, value: reward };
      },

      async joinBattle(battleId, side, amount, pointsMode) {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const id = toId(battleId);
        if (id === null) return fail("We couldn't find that battle.");
        if (!pointsMode) {
          const short = needMoney(balance(), amount);
          if (short) return fail(short);
        }
        const sent = await send(calls.joinBattle(id, side, amount, pointsMode));
        if (!sent.ok) return sent;
        const reward = await settle(true);
        commitMirror((m) => {
          const existing = m.picks[battleId];
          return {
            ...log("Picked a side", reward.xp)(m),
            picks: { ...m.picks, [battleId]: { side, amount: (existing?.amount ?? 0n) + (pointsMode ? 0n : amount) } },
          };
        });
        return { ok: true, value: reward };
      },

      async voteJury(caseId, vote) {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const id = toId(caseId);
        if (id === null) return fail("We couldn't find that case.");
        const sent = await send(calls.voteJury(id, vote));
        if (!sent.ok) return sent;
        await settle(false);
        commitMirror((m) => ({ ...m, jury: { ...m.jury, [caseId]: vote } }));
        return OK;
      },

      async voteProposal(proposalId, support) {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const id = toId(proposalId);
        if (id === null) return fail("We couldn't find that proposal.");
        const sent = await send(calls.voteProposal(id, support));
        if (!sent.ok) return sent;
        const reward = await settle(true);
        commitMirror((m) => ({ ...log("Voted on the treasury", reward.xp)(m), proposalVotes: { ...m.proposalVotes, [proposalId]: support } }));
        return { ok: true, value: reward };
      },

      async toggleEnlist() {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const wasEnlisted = latest.current.chain?.enlisted ?? false;
        const sent = await send(wasEnlisted ? calls.leaveJury() : calls.enlist());
        if (!sent.ok) return sent;
        await settle(true);
        return { ok: true, value: latest.current.chain?.enlisted ?? !wasEnlisted };
      },

      async propose(amount, recipient, rawDescription) {
        const missing = needCharacter();
        if (missing) return fail(missing);
        if (amount <= 0n) return fail("Enter an amount greater than zero.");
        if (!isAddress(recipient.id, { strict: false })) return fail("Choose who gets the money.");
        const description = cleanText(rawDescription, LIMITS.description, { multiline: true }).value;
        if (description.length < 10) return fail("Tell the community what the money is for (at least a sentence).");
        const sent = await send(calls.proposeSpend(REALM_CREATOR_ID, recipient.id, amount, description));
        if (!sent.ok) return sent;
        const reward = await settle(true);
        commitMirror((m) => ({
          ...log("Proposed a treasury payout", reward.xp)(m),
          proposals: [
            { id: String(100 + m.proposals.length), amount, recipient: recipient.id, recipientName: recipient.name, description, at: Date.now() },
            ...m.proposals,
          ].slice(0, 20),
        }));
        return { ok: true, value: reward };
      },

      async claim(key, _amount) {
        if (latest.current.mirror.claimed[key]) return OK;
        const id = toId(key.slice(1));
        if (id === null || (key[0] !== "q" && key[0] !== "b")) return fail("We couldn't find that.");
        const sent = await send(key[0] === "q" ? calls.claimQuest(id) : calls.claimBattle(id));
        if (!sent.ok) return sent;
        await settle(true);
        commitMirror((m) => ({ ...m, claimed: { ...m.claimed, [key]: true } }));
        return OK;
      },

      async dispute(questId) {
        const id = toId(questId);
        if (id === null) return fail("We couldn't find that quest.");
        const sent = await send(calls.disputeQuest(id));
        if (!sent.ok) return sent;
        await settle(false);
        commitMirror((m) => ({ ...m, disputes: { ...m.disputes, [questId]: true } }));
        return OK;
      },

      loadSampleHistory() {},
      addSampleXp() {
        return { xp: 0n, levelUp: null };
      },

      async signOut() {
        try {
          await latest.current.logout();
        } finally {
          setPendingEmail(null);
          setChain({ loaded: false, data: null });
          setMirror(EMPTY_MIRROR);
        }
      },
    };
  }, [whenReady, refresh, commitMirror]);

  // ---- the value screens read -----------------------------------------------------------------------
  const state = React.useMemo<State>(
    () => ({
      ...INITIAL,
      ...mirror,
      status: privy.authenticated ? "authenticated" : "anonymous",
      email: privy.user?.email?.address ?? null,
      pendingEmail,
      character: toCharacter(chain.data, mirror.since),
      balance: chain.data?.balance ?? 0n,
      enlisted: chain.data?.enlisted ?? false,
    }),
    [mirror, privy.authenticated, privy.user?.email?.address, pendingEmail, chain.data],
  );

  // ready = Privy has restored the session and, if signed in, the first read finished (or the account failed to start)
  const ready = privy.ready && (!privy.authenticated || chain.loaded || account.state.status === "error" || !DEPLOYED);

  const value = React.useMemo<SessionApi>(
    () => deriveApi({ mode: "chain", ready, state, address, refresh, actions }),
    [ready, state, address, refresh, actions],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
