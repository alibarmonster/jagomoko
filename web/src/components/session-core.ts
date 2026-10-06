import * as React from "react";
import type { Role } from "@/lib/roles";
import { formatUsd, usd, type Usd } from "@/lib/money";
import type { Split } from "@/lib/outcomes";
import type { Call } from "@/lib/chain/calls";
import { levelForXp, levelProgress, votingWeight } from "@/lib/xp";
import type { MyGuild } from "@/lib/data/mine";

/**
 * The shape every screen depends on. Two providers fill it:
 *  - session-sample.tsx: everything lives in this browser (localStorage), for exploring the product
 *  - session-chain.tsx:  real email sign-in (Privy) and real transactions on Monad testnet
 * Screens do not know which one they are talking to.
 */

/** "Practice gold": what the testnet faucet gives. */
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

/** `tx` is the transaction hash when the action went on chain, so the screen can link to it. */
export type Result<T = void> = { ok: true; value: T; tx?: string } | { ok: false; error: string };

/** The sample provider answers instantly; the chain provider answers when the transaction lands. */
export type Async<T> = T | Promise<T>;

export interface State {
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
  /** the realm this account owns (a streamer), if any. `creatorId` is the on-chain id as a string. */
  realm: { creatorId: string; handle: string } | null;
  proposals: { id: string; amount: Usd; recipient: string; recipientName: string; description: string; at: number }[];
  xpLog: { at: number; label: string; xp: bigint }[];
  /** the guilds this account is a member of, most guild XP first */
  guilds: MyGuild[];
  /** bountyId -> the clip this account voted for */
  clipVotes: Record<string, string>;
  /** bountyId -> the clip this account sent */
  clipsSent: Record<string, string>;
}

export const INITIAL: State = {
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
  realm: null,
  proposals: [],
  xpLog: [],
  guilds: [],
  clipVotes: {},
  clipsSent: {},
};

export function hydrate(raw: Partial<State> | null): State | null {
  if (!raw || (raw.status !== "anonymous" && raw.status !== "authenticated")) return null;
  const merged = { ...INITIAL, ...raw } as State;
  if (merged.character && typeof merged.character.since !== "number") merged.character = { ...merged.character, since: Date.now() };
  return merged;
}

export type SessionMode = "sample" | "chain";

/** A transaction that landed: its hash and the block it is in (so a screen can wait for the live record to reach it). */
export interface SentTx {
  hash: string;
  blockNumber: bigint;
}

export interface SessionActions {
  requestCode: (email: string) => Async<Result>;
  verifyCode: (code: string) => Async<Result>;
  /** Chain mode: opens Privy sign-in. The sample flow has its own email and code steps instead. */
  openSignIn: () => void;
  /** The name is kept off chain (lib/profile-name.ts); only a stand-in like "Knight-7f3a" is minted. */
  createCharacter: (role: Role, name: string) => Async<Result>;
  /** Changes the character's name. Names are kept off chain, so this costs no transaction. */
  renameCharacter: (name: string) => Async<Result>;
  /** A streamer opens their realm (one per account). `handle` is validated by lib/handle. */
  openRealm: (handle: string, split: Split) => Async<Result>;
  claimPracticeGold: () => Async<Result<Usd>>;
  /**
   * Tip a realm. `creatorId` is the realm's on-chain id. With `anonymous`, the name is hidden on
   * stream and in the feeds; XP and totals are unchanged and the account stays visible on chain.
   */
  tip: (creatorId: string, amount: Usd, memo: string, opts?: { anonymous?: boolean }) => Async<Result<Reward>>;
  backQuest: (questId: string, amount: Usd) => Async<Result<Reward>>;
  joinBattle: (battleId: string, side: 0 | 1, amount: Usd, pointsMode: boolean) => Async<Result<Reward>>;
  voteJury: (caseId: string, vote: "yes" | "no") => Async<Result>;
  voteProposal: (proposalId: string, support: boolean) => Async<Result<Reward>>;
  toggleEnlist: () => Async<Result<boolean>>;
  /** `recipient.id` is the recipient's address */
  propose: (creatorId: string, amount: Usd, recipient: { id: string; name: string }, description: string) => Async<Result<Reward>>;
  /** `key` is "q<id>" for a quest or "b<id>" for a battle */
  claim: (key: string, amount: Usd) => Async<Result>;
  dispute: (questId: string) => Async<Result>;
  /** Anyone can close a treasury vote once its time is up: it pays out (or applies) if it passed. */
  executeProposal: (proposalId: string) => Async<Result>;
  /** Anyone can close a jury case once its voting time is up. */
  resolveJuryCase: (caseId: string) => Async<Result>;
  /** A Bard sends one clip per bounty: a link to it, which stays on their own account. */
  submitClip: (bountyId: string, url: string) => Async<Result<Reward>>;
  /** One vote per bounty, weighted by sqrt(XP). */
  voteClip: (bountyId: string, clipId: string) => Async<Result<Reward>>;
  /** Anyone can settle a bounty once voting is over: it pays the winner, or sends the money back. */
  settleBounty: (bountyId: string) => Async<Result>;
  /** prototype helpers: do nothing in chain mode */
  loadSampleHistory: () => void;
  addSampleXp: (xp: bigint) => Reward;
  signOut: () => Async<void>;
}

export interface SessionApi {
  mode: SessionMode;
  ready: boolean;
  state: State;
  /** the viewer's account address (chain mode), for showing and linking */
  address: string | null;
  /** re-reads balance, XP and jury status from the chain (a no-op in sample mode) */
  refresh: () => Promise<void>;
  /** Sends calls as one sponsored batch and resolves with the transaction hash (chain mode only). */
  send: (calls: Call[]) => Promise<Result<SentTx>>;
  /** Derived */
  signedIn: boolean;
  hasCharacter: boolean;
  level: number;
  progress: ReturnType<typeof levelProgress>;
  weight: bigint;
  canServeOnJury: boolean;
  actions: SessionActions;
}

export const SessionContext = React.createContext<SessionApi | null>(null);

export function useSession(): SessionApi {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export function grant(character: SessionCharacter, xp: bigint): { character: SessionCharacter; reward: Reward } {
  const from = levelForXp(character.xp);
  const next = { ...character, xp: character.xp + xp };
  const to = levelForXp(next.xp);
  return { character: next, reward: { xp, levelUp: to > from ? { from, to } : null } };
}

/** The reward for an action that already happened: what XP the character gained between two reads. */
export function rewardBetween(before: SessionCharacter | null, after: SessionCharacter | null): Reward {
  const from = before?.xp ?? 0n;
  const to = after?.xp ?? 0n;
  const gained = to > from ? to - from : 0n;
  const lvlFrom = levelForXp(from);
  const lvlTo = levelForXp(to);
  return { xp: gained, levelUp: lvlTo > lvlFrom ? { from: lvlFrom, to: lvlTo } : null };
}

export function needMoney(balance: Usd, amount: Usd): string | null {
  if (balance >= amount) return null;
  return `You need ${formatUsd(amount - balance, { cents: "always" })} more. Top up with practice gold first.`;
}

/** Builds the value the context provides from the provider's state. */
export function deriveApi(parts: {
  mode: SessionMode;
  ready: boolean;
  state: State;
  address: string | null;
  refresh: () => Promise<void>;
  send: (calls: Call[]) => Promise<Result<SentTx>>;
  actions: SessionActions;
}): SessionApi {
  const xp = parts.state.character?.xp ?? 0n;
  const progress = levelProgress(xp);
  return {
    ...parts,
    signedIn: parts.state.status === "authenticated",
    hasCharacter: parts.state.character !== null,
    level: progress.level,
    progress,
    weight: votingWeight(xp),
    canServeOnJury: parts.state.character?.role === "Judge" && progress.level >= JURY_MIN_LEVEL,
  };
}
