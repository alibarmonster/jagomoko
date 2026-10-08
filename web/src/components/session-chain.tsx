"use client";

/**
 * Chain session: real email sign-in (Privy) and real transactions on Monad testnet.
 *
 * - Sign-in is Privy's own modal. Privy creates an embedded wallet; that wallet owns a smart
 *   account; gas for everything below is sponsored (see lib/aa and /api/aa). No wallet screens, no fees.
 * - Balance, character, XP, jury status and the guild you own are READ from the chain, so they are always true.
 *   The character's name is the exception: it is kept off chain (lib/profile/name.ts), so the chain
 *   only holds a stand-in like "Knight-7f3a" and the real name comes from /api/profile.
 * - What you did (quests backed, picks, votes, claims, tips, XP history) comes from the indexer, so it
 *   is the same on every device. After a move, the session waits for the indexer to reach that block
 *   before re-reading. When the screens show the sample world instead (NEXT_PUBLIC_SAMPLE_DATA=true),
 *   that history is mirrored in this browser, as before.
 */

import * as React from "react";
import { PrivyProvider, usePrivy, type PrivyClientConfig } from "@privy-io/react-auth";
import { isAddress, type Hash } from "viem";
import { SAMPLE_DATA } from "@/lib/config";
import { fetchMineClient, waitForIndexer } from "@/lib/data/client";
import type { Mine } from "@/lib/data/mine";
import { cleanText, clipUrl, LIMITS } from "@/lib/utils/sanitize";
import { checkName, profileMessage, standIn } from "@/lib/profile/name";
import { fetchMyName, saveMyName } from "@/lib/profile/client";
import { validateHandle } from "@/lib/domain/handle";
import { tipMemo } from "@/lib/domain/tip-memo";
import { votingWeight } from "@/lib/domain/xp";
import { load, save } from "@/lib/utils/persist";
import { createCalls, toId, type Call } from "@/lib/chain/calls";
import { CHAIN_ID, CLIPS_LIVE, CONTRACTS, DEPLOYED, monadTestnet } from "@/lib/chain/config";
import { friendlyError } from "@/lib/chain/errors";
import { readViewer, type ViewerChainState } from "@/lib/chain/reads";
import { useSmartAccount } from "@/lib/aa/use-smart-account";
import { DATA_CHANGED_EVENT } from "./app/auto-refresh";
import {
  deriveApi,
  INITIAL,
  needMoney,
  PRACTICE_GOLD,
  rewardBetween,
  SessionContext,
  type Result,
  type SessionActions,
  type SentTx,
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
  // Privy's prebuilt sign-in modal, themed to match
  appearance: {
    theme: "light",
    accentColor: "#5b43e8",
    landingHeader: "Sign in to jagomoko",
    loginMessage: "No app, no wallet. Just your email.",
  },
};

const OK = { ok: true, value: undefined } as const;
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
/** A move that went on chain: carries its transaction, so the screen can link to it. */
const sentOk = <T,>(sent: SentTx, value: T) => ({ ok: true as const, value, tx: sent.hash });

/** What the chain cannot tell us yet: the viewer's own history, until the indexer provides it. */
type Mirror = Pick<State, "backed" | "picks" | "tips" | "jury" | "proposalVotes" | "proposalVoteWeights" | "claimed" | "disputes" | "proposals" | "xpLog"> & {
  /** when the character was first seen (the contract does not store a creation time) */
  since: number | null;
};

const EMPTY_MIRROR: Mirror = {
  backed: {},
  picks: {},
  tips: [],
  jury: {},
  proposalVotes: {},
  proposalVoteWeights: {},
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

/** `name` is the one kept off chain; without it the character shows its on-chain stand-in. */
const toCharacter = (data: ViewerChainState | null, since: number | null, name?: string | null): SessionCharacter | null =>
  data?.character ? { ...data.character, name: name ?? data.character.name, since: since ?? Date.now() } : null;

function ChainSessionInner({ children }: { children: React.ReactNode }) {
  const privy = usePrivy();
  const account = useSmartAccount();

  const userId = privy.user?.id ?? null;
  const address = account.state.status === "ready" ? account.state.account.address : null;

  const [mirror, setMirror] = React.useState<Mirror>(EMPTY_MIRROR);
  const [chain, setChain] = React.useState<{ loaded: boolean; data: ViewerChainState | null }>({ loaded: false, data: null });
  // what this account has done, from the indexer (live data only)
  const [mine, setMine] = React.useState<Mine | null>(null);
  // the character's name, kept off chain
  const [profileName, setProfileName] = React.useState<string | null>(null);

  // the actions below are created once and read the latest values through refs
  const latest = React.useRef({
    mirror,
    chain: chain.data,
    mine,
    address,
    userId,
    login: privy.login,
    authenticated: privy.authenticated,
    logout: privy.logout,
    getAccessToken: privy.getAccessToken,
  });
  latest.current = {
    mirror,
    chain: chain.data,
    mine,
    address,
    userId,
    login: privy.login,
    authenticated: privy.authenticated,
    logout: privy.logout,
    getAccessToken: privy.getAccessToken,
  };

  // ---- the local mirror, per account ------------------------------------------------------------
  React.useEffect(() => {
    // merged over the empty mirror, so a mirror saved before a field existed still has it
    setMirror(userId ? { ...EMPTY_MIRROR, ...load<Partial<Mirror>>(mirrorKey(userId)) } : EMPTY_MIRROR);
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

  /** What this account has done, from the indexer. Keeps the last good copy if the read fails. */
  const refreshMine = React.useCallback(async () => {
    const who = latest.current.address;
    if (!who || SAMPLE_DATA) return;
    const data = await fetchMineClient(who);
    if (data) {
      latest.current.mine = data;
      setMine(data);
    }
  }, []);

  React.useEffect(() => {
    if (!address) {
      setChain({ loaded: false, data: null });
      setMine(null);
      return;
    }
    void refresh();
    void refreshMine();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
      void refreshMine();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [address, refresh, refreshMine]);

  // the name is kept off chain: read it once per sign-in
  React.useEffect(() => {
    if (!userId || !address) {
      setProfileName(null);
      return;
    }
    let cancelled = false;
    void latest.current.getAccessToken().then(async (token) => {
      const saved = token ? await fetchMyName(token) : null;
      if (!cancelled && saved && saved.address.toLowerCase() === address.toLowerCase()) setProfileName(saved.name);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, address]);

  // the first time a character shows up, remember when (the contract does not store it)
  React.useEffect(() => {
    if (chain.data?.character && mirror.since === null) commitMirror((m) => ({ ...m, since: Date.now() }));
  }, [chain.data?.character, mirror.since, commitMirror]);

  // ---- actions ------------------------------------------------------------------------------------
  const whenReady = account.whenReady;

  /** Sends one sponsored batch. Never throws: a problem becomes a plain sentence. */
  const send = React.useCallback(
    async (list: Call[]): Promise<Result<SentTx>> => {
      if (!DEPLOYED) return fail("This isn't switched on yet.");
      try {
        const viewer = await whenReady();
        return { ok: true, value: await viewer.send(list) };
      } catch (error) {
        return fail(friendlyError(error));
      }
    },
    [whenReady],
  );

  const actions = React.useMemo<SessionActions>(() => {
    const snapshot = (d: ViewerChainState | null) => ({
      b: d?.balance ?? 0n,
      x: d?.character?.xp ?? 0n,
      c: d?.character !== null && d?.character !== undefined,
      e: d?.enlisted ?? false,
      r: d?.realm?.creatorId ?? 0n,
    });
    const changed = (a: ViewerChainState | null, b: ViewerChainState | null) => {
      const [p, q] = [snapshot(a), snapshot(b)];
      return p.b !== q.b || p.x !== q.x || p.c !== q.c || p.e !== q.e || p.r !== q.r;
    };

    /**
     * After a transaction: let the indexer reach its block, re-read the chain and the history, tell
     * every live screen to refresh, and report what changed. A read can land a block behind the
     * receipt, so when we expect a change we look again a few times before giving up.
     */
    async function settle(expectChange: boolean, blockNumber?: bigint) {
      const before = latest.current.chain;
      if (blockNumber !== undefined && !SAMPLE_DATA) await waitForIndexer(blockNumber);
      for (let attempt = 0; attempt < 5; attempt++) {
        await refresh();
        if (!expectChange || changed(before, latest.current.chain)) break;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      await refreshMine();
      window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
      return rewardBetween(toCharacter(before, null), toCharacter(latest.current.chain, null));
    }

    const log = (label: string, xp: bigint) => (m: Mirror): Mirror =>
      xp > 0n ? { ...m, xpLog: [{ at: Date.now(), label, xp }, ...m.xpLog].slice(0, 40) } : m;

    const balance = () => latest.current.chain?.balance ?? 0n;
    const needCharacter = () => (latest.current.chain?.character ? null : "Create your character first.");

    /**
     * Saves a name for this account: the smart account signs it (no transaction, no fee) and
     * /api/profile keeps it. The chain never sees it.
     */
    async function claimName(rawName: string): Promise<Result<string>> {
      const checked = checkName(rawName);
      if (!checked.ok) return checked;
      const userId = latest.current.userId;
      if (!userId) return fail("Sign in first.");
      try {
        const viewer = await whenReady();
        const issuedAt = Date.now();
        const signature = await viewer.signMessage(profileMessage({ address: viewer.address, name: checked.name, userId, chainId: CHAIN_ID, issuedAt }));
        const token = await latest.current.getAccessToken();
        if (!token) return fail("Sign in again.");
        const saved = await saveMyName(token, { address: viewer.address, name: checked.name, issuedAt, signature });
        if (!saved.ok) return saved;
        setProfileName(saved.value.name);
        return { ok: true, value: saved.value.name };
      } catch (error) {
        return fail(friendlyError(error));
      }
    }

    return {
      // sign-in is Privy's own modal (openSignIn); these exist for the sample provider only
      requestCode: () => fail("Use the sign-in window."),
      verifyCode: () => fail("Use the sign-in window."),

      openSignIn() {
        if (latest.current.authenticated) return;
        latest.current.login({ loginMethods: ["email"] });
      },

      async openRealm(rawHandle, split) {
        const checked = validateHandle(rawHandle);
        if (!checked.ok) return fail(checked.error);
        if (latest.current.chain?.realm) return fail("You already have a guild.");
        const total = split.creatorBps + split.treasuryBps + split.communityBps;
        if (total !== 10_000 || split.treasuryBps + split.communityBps < 200) {
          return fail("The split has to add up to 100%, with at least 2% for the community.");
        }
        const sent = await send(calls.registerCreator(checked.handle, split));
        if (!sent.ok) return sent;
        await settle(true, sent.value.blockNumber);
        return sentOk(sent.value, undefined);
      },

      async createCharacter(role, rawName) {
        if (latest.current.chain?.character) return fail("You already have a character.");
        // the name first: if it is taken, nothing has been minted yet and the form can say so
        const named = await claimName(rawName);
        if (!named.ok) return named;
        const address = latest.current.address;
        if (!address) return fail("Your account is still starting. Try again in a moment.");
        const sent = await send(calls.mintCharacter(role, standIn(role, address)));
        if (!sent.ok) return sent;
        await settle(true, sent.value.blockNumber);
        commitMirror((m) => ({ ...m, since: Date.now() }));
        return sentOk(sent.value, undefined);
      },

      async renameCharacter(rawName) {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const named = await claimName(rawName);
        if (!named.ok) return named;
        window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
        return OK;
      },

      async claimPracticeGold() {
        const sent = await send(calls.faucet());
        if (!sent.ok) return sent;
        await settle(true, sent.value.blockNumber);
        return sentOk(sent.value, PRACTICE_GOLD);
      },

      async tip(creatorId, amount, memo, opts) {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const realm = toId(creatorId);
        if (realm === null) return fail("We couldn't find that guild.");
        const short = needMoney(balance(), amount);
        if (short) return fail(short);
        const cleaned = cleanText(memo, LIMITS.memo).value;
        const sent = await send(calls.tip(realm, amount, tipMemo(cleaned, opts?.anonymous === true)));
        if (!sent.ok) return sent;
        const reward = await settle(true, sent.value.blockNumber);
        commitMirror((m) => ({ ...log("Tip", reward.xp)(m), tips: [{ amount, memo: cleaned, at: Date.now() }, ...m.tips].slice(0, 40) }));
        return sentOk(sent.value, reward);
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
        const reward = await settle(true, sent.value.blockNumber);
        commitMirror((m) => ({ ...log("Backed a quest", reward.xp)(m), backed: { ...m.backed, [questId]: (m.backed[questId] ?? 0n) + amount } }));
        return sentOk(sent.value, reward);
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
        const reward = await settle(true, sent.value.blockNumber);
        commitMirror((m) => {
          const existing = m.picks[battleId];
          return {
            ...log("Picked a side", reward.xp)(m),
            picks: { ...m.picks, [battleId]: { side, amount: (existing?.amount ?? 0n) + (pointsMode ? 0n : amount) } },
          };
        });
        return sentOk(sent.value, reward);
      },

      async voteJury(caseId, vote) {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const id = toId(caseId);
        if (id === null) return fail("We couldn't find that case.");
        const sent = await send(calls.voteJury(id, vote));
        if (!sent.ok) return sent;
        await settle(false, sent.value.blockNumber);
        commitMirror((m) => ({ ...m, jury: { ...m.jury, [caseId]: vote } }));
        return sentOk(sent.value, undefined);
      },

      async voteProposal(proposalId, support) {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const id = toId(proposalId);
        if (id === null) return fail("We couldn't find that proposal.");
        // the contract weighs the vote by the XP held before it (the vote's own XP comes after)
        const weight = votingWeight(latest.current.chain?.character?.xp ?? 0n);
        const sent = await send(calls.voteProposal(id, support));
        if (!sent.ok) return sent;
        const reward = await settle(true, sent.value.blockNumber);
        commitMirror((m) => ({
          ...log("Voted on the treasury", reward.xp)(m),
          proposalVotes: { ...m.proposalVotes, [proposalId]: support },
          proposalVoteWeights: { ...m.proposalVoteWeights, [proposalId]: weight },
        }));
        return sentOk(sent.value, reward);
      },

      async toggleEnlist() {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const wasEnlisted = latest.current.chain?.enlisted ?? false;
        const sent = await send(wasEnlisted ? calls.leaveJury() : calls.enlist());
        if (!sent.ok) return sent;
        await settle(true, sent.value.blockNumber);
        return sentOk(sent.value, latest.current.chain?.enlisted ?? !wasEnlisted);
      },

      async propose(creatorId, amount, recipient, rawDescription) {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const realm = toId(creatorId);
        if (realm === null) return fail("We couldn't find that guild.");
        if (amount <= 0n) return fail("Enter an amount greater than zero.");
        if (!isAddress(recipient.id, { strict: false })) return fail("Choose who gets the money.");
        const description = cleanText(rawDescription, LIMITS.description, { multiline: true }).value;
        if (description.length < 10) return fail("Tell the community what the money is for (at least a sentence).");
        const sent = await send(calls.proposeSpend(realm, recipient.id, amount, description));
        if (!sent.ok) return sent;
        const reward = await settle(true, sent.value.blockNumber);
        commitMirror((m) => ({
          ...log("Proposed a treasury payout", reward.xp)(m),
          proposals: [
            { id: String(100 + m.proposals.length), amount, recipient: recipient.id, recipientName: recipient.name, description, at: Date.now() },
            ...m.proposals,
          ].slice(0, 20),
        }));
        return sentOk(sent.value, reward);
      },

      async proposeAllocation(creatorId, bps, rawDescription) {
        const missing = needCharacter();
        if (missing) return fail(missing);
        const realm = toId(creatorId);
        if (realm === null) return fail("We couldn't find that guild.");
        if (!Number.isInteger(bps) || bps < 0 || bps > 5_000) return fail("Pick a share between 0% and 50%.");
        const description = cleanText(rawDescription, LIMITS.description, { multiline: true }).value;
        if (description.length < 10) return fail("Tell the community why (at least a sentence).");
        const sent = await send(calls.proposeAllocation(realm, bps, description));
        if (!sent.ok) return sent;
        const reward = await settle(true, sent.value.blockNumber);
        commitMirror((m) => log("Proposed putting the treasury to work", reward.xp)(m));
        return sentOk(sent.value, reward);
      },

      async claim(key, _amount) {
        if (latest.current.mirror.claimed[key] || latest.current.mine?.claimed[key]) return OK;
        const id = toId(key.slice(1));
        if (id === null || (key[0] !== "q" && key[0] !== "b")) return fail("We couldn't find that.");
        const sent = await send(key[0] === "q" ? calls.claimQuest(id) : calls.claimBattle(id));
        if (!sent.ok) return sent;
        await settle(true, sent.value.blockNumber);
        commitMirror((m) => ({ ...m, claimed: { ...m.claimed, [key]: true } }));
        return sentOk(sent.value, undefined);
      },

      async executeProposal(proposalId) {
        const id = toId(proposalId);
        if (id === null) return fail("We couldn't find that proposal.");
        const sent = await send(calls.executeProposal(id));
        if (!sent.ok) return sent;
        await settle(false, sent.value.blockNumber);
        return sentOk(sent.value, undefined);
      },

      async resolveJuryCase(caseId) {
        const id = toId(caseId);
        if (id === null) return fail("We couldn't find that case.");
        const sent = await send(calls.resolveJuryCase(id));
        if (!sent.ok) return sent;
        await settle(false, sent.value.blockNumber);
        return sentOk(sent.value, undefined);
      },

      async submitClip(bountyId, rawUrl) {
        if (!CLIPS_LIVE) return fail("Clip bounties aren't switched on yet.");
        const missing = needCharacter();
        if (missing) return fail(missing);
        if (latest.current.chain?.character?.role !== "Bard") return fail("Only Bards can send clips.");
        const link = clipUrl(rawUrl);
        if (!link) return fail("Paste a link to one clip on TikTok, YouTube, Twitch, Instagram or X.");
        const id = toId(bountyId);
        if (id === null) return fail("We couldn't find that bounty.");
        // the cleaned link goes on chain: no tracking junk in the public record
        const sent = await send(calls.submitClip(id, link.url));
        if (!sent.ok) return sent;
        const reward = await settle(true, sent.value.blockNumber);
        commitMirror(log("Sent a clip", reward.xp));
        return sentOk(sent.value, reward);
      },

      async voteClip(_bountyId, clipId) {
        if (!CLIPS_LIVE) return fail("Clip bounties aren't switched on yet.");
        const missing = needCharacter();
        if (missing) return fail(missing);
        const id = toId(clipId);
        if (id === null) return fail("We couldn't find that clip.");
        const sent = await send(calls.voteClip(id));
        if (!sent.ok) return sent;
        const reward = await settle(true, sent.value.blockNumber);
        commitMirror(log("Voted on a clip", reward.xp));
        return sentOk(sent.value, reward);
      },

      async settleBounty(bountyId) {
        if (!CLIPS_LIVE) return fail("Clip bounties aren't switched on yet.");
        const id = toId(bountyId);
        if (id === null) return fail("We couldn't find that bounty.");
        const sent = await send(calls.finalizeBounty(id));
        if (!sent.ok) return sent;
        await settle(false, sent.value.blockNumber);
        return sentOk(sent.value, undefined);
      },

      async dispute(questId) {
        const id = toId(questId);
        if (id === null) return fail("We couldn't find that quest.");
        const sent = await send(calls.disputeQuest(id));
        if (!sent.ok) return sent;
        await settle(false, sent.value.blockNumber);
        commitMirror((m) => ({ ...m, disputes: { ...m.disputes, [questId]: true } }));
        return sentOk(sent.value, undefined);
      },

      loadSampleHistory() {},
      addSampleXp() {
        return { xp: 0n, levelUp: null };
      },

      async signOut() {
        try {
          await latest.current.logout();
        } finally {
          setChain({ loaded: false, data: null });
          setMirror(EMPTY_MIRROR);
          setProfileName(null);
        }
      },
    };
  }, [send, refresh, commitMirror, whenReady]);

  // ---- the value screens read -----------------------------------------------------------------------
  const state = React.useMemo<State>(
    () => ({
      ...INITIAL,
      ...mirror,
      // with live data the history is the indexer's, not this browser's
      ...(!SAMPLE_DATA
        ? {
            backed: mine?.backed ?? {},
            picks: mine?.picks ?? {},
            claimed: mine?.claimed ?? {},
            jury: mine?.jury ?? {},
            proposalVotes: mine?.proposalVotes ?? {},
            proposalVoteWeights: { ...mirror.proposalVoteWeights, ...mine?.proposalVoteWeights },
            disputes: mine?.disputes ?? {},
            tips: mine?.tips ?? [],
            xpLog: mine?.xpLog ?? [],
            guilds: mine?.guilds ?? [],
            clipVotes: mine?.clipVotes ?? {},
            clipsSent: mine?.clipsSent ?? {},
            proposals: [],
          }
        : {}),
      status: privy.authenticated ? "authenticated" : "anonymous",
      email: privy.user?.email?.address ?? null,
      pendingEmail: null,
      character: toCharacter(chain.data, mirror.since, profileName),
      balance: chain.data?.balance ?? 0n,
      enlisted: chain.data?.enlisted ?? false,
      realm: chain.data?.realm ? { creatorId: chain.data.realm.creatorId.toString(), handle: chain.data.realm.handle } : null,
    }),
    [mirror, mine, privy.authenticated, privy.user?.email?.address, chain.data, profileName],
  );

  // ready = Privy has restored the session and, if signed in, the first read finished (or the account failed to start)
  const ready = privy.ready && (!privy.authenticated || chain.loaded || account.state.status === "error" || !DEPLOYED);

  const value = React.useMemo<SessionApi>(
    () => deriveApi({ mode: "chain", ready, state, address, refresh, send, actions }),
    [ready, state, address, refresh, send, actions],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
