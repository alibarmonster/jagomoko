import { decodeErrorResult, type Abi } from "viem";
import { battleAbi, characterAbi, clipsAbi, faucetAbi, juryAbi, questAbi, registryAbi, treasuryAbi, usdAbi, vaultAbi } from "./abis";

/**
 * Turns anything that can go wrong (a contract revert, a bundler or paymaster error, a dropped
 * connection) into one plain sentence. Viewers never see "revert", "gas", "nonce" or a hex string.
 */

/** Every custom error any contract can throw, so a raw revert payload can be decoded by name. */
const ERRORS: Abi = [...usdAbi, ...faucetAbi, ...characterAbi, ...vaultAbi, ...questAbi, ...battleAbi, ...juryAbi, ...treasuryAbi, ...registryAbi, ...clipsAbi].filter(
  (item) => item.type === "error",
) as unknown as Abi;

const BY_NAME: Record<string, string> = {
  AlreadyEnlisted: "You are already on the jury list.",
  AlreadyHasCharacter: "You already have a character.",
  AlreadyRegistered: "You already have a guild.",
  AlreadySubmitted: "You already sent a clip for this bounty.",
  AlreadyResolved: "This one is already settled.",
  AlreadyVoted: "You already voted on this.",
  BadAmount: "That amount doesn't work here. Check the number and try again.",
  BadCloseTime: "That time isn't valid.",
  BadDeadline: "That time isn't valid.",
  BadSide: "Pick a side first.",
  BadVerdict: "Choose yes or no.",
  BattleClosed: "Picks are closed for this battle.",
  BattleStillOpen: "This battle is still open.",
  BadWindow: "Those times don't work. Give clips and votes at least a minute each, and end within 30 days.",
  BountyClosed: "This bounty is closed.",
  CannotProposeYet: "The result can't be reported yet.",
  ChallengeWindowClosed: "The window to dispute this has closed.",
  ChallengeWindowOpen: "The dispute window is still open. Try again when it ends.",
  ClipIsHidden: "The creator hid that clip.",
  HandleTaken: "That name is taken.",
  InsufficientBalance: "There isn't enough there.",
  InvalidAllocation: "That share is too high. The community can put up to 50% of the treasury to work.",
  InvalidHandle: "That name isn't allowed.",
  InvalidName: "Pick a name between 1 and 24 characters.",
  InvalidSplit: "The split has to add up to 100%, with at least 2% for the community.",
  InvalidTitle: "Give the bounty a title (up to 80 characters).",
  InvalidUrl: "Paste the full https:// link to your clip.",
  InvalidTarget: "That share is too high. The community can put up to 50% of the treasury to work.",
  NoCharacter: "Create your character first.",
  NoPendingSplit: "There is no change waiting.",
  NoStrategy: "There's nothing to put the treasury into yet.",
  NoWeight: "You need some XP to vote. Back a quest or send a tip first.",
  NotAPayout: "That community payout hasn't reached the clip board yet.",
  NotAllowed: "You can't do that in this bounty.",
  NotBard: "Only Bards can send clips.",
  NotActive: "That isn't open any more.",
  NotCreator: "Only the creator can do that.",
  NotEligible: "You need to be a Judge at level 5 or higher.",
  NotEnlisted: "You aren't on the jury list.",
  NotJuror: "You weren't picked for this jury.",
  NotJury: "That can only be done by the jury.",
  NotOperator: "Only the creator or a moderator can do that.",
  NotParticipant: "Only people who took part can do that.",
  NotResolved: "That isn't settled yet.",
  NothingToClaim: "There's nothing to claim here.",
  OperatorCannotPlay: "Creators and moderators can't play in their own guild.",
  OwnClip: "You can't vote for your own clip.",
  ProposalUsed: "That community payout was already used.",
  QuestClosed: "Backing is closed for this quest.",
  SideLocked: "You already picked the other side.",
  Soulbound: "Characters can't be moved.",
  StrategyInUse: "That can't change while money is in it.",
  SubmissionsClosed: "Clips are closed for this bounty.",
  TooEarly: "It's too early. Try again a bit later.",
  TooManyClips: "This bounty already has 50 clips.",
  UnknownBattle: "We couldn't find that battle.",
  UnknownBounty: "We couldn't find that bounty.",
  UnknownClip: "We couldn't find that clip.",
  UnknownCreator: "We couldn't find that guild.",
  UnknownQuest: "We couldn't find that quest.",
  VotingActive: "Voting is still open.",
  VotingClosed: "Voting has ended.",
  VotingEnded: "Voting has ended.",
  WrongAsset: "That doesn't use the same money.",
  WrongCreator: "That payout belongs to another guild.",
  WrongStage: "That can't be done at this stage.",
  ZeroAmount: "Enter an amount greater than zero.",
  Cooldown: "Practice gold is on cooldown. You can claim more in about an hour.",
  // OpenZeppelin
  ERC20InsufficientBalance: "You need more practice gold for that.",
  ERC20InsufficientAllowance: "Something went wrong with the approval. Try again.",
  AccessControlUnauthorizedAccount: "You can't do that.",
};

/** [pattern on the error text, message]. Checked in order, first match wins. */
const BY_TEXT: [RegExp, string][] = [
  [/invalid (email )?(verification |login )?code|incorrect (verification )?code|code (is )?(invalid|incorrect|expired)|too many attempts/i, "That code isn't right, or it expired. Check it and try again."],
  [/user (rejected|denied|cancel)|rejected the request|request (was )?(rejected|denied)|cancell?ed/i, "Cancelled."],
  [/MockUSD: cooldown/i, "Practice gold is on cooldown. You can claim more in about an hour."],
  [/rate limit|too many requests|\b429\b/i, "Slow down a little, then try again."],
  [/sponsor|paymaster|\bAA3\d\b|policy|daily limit|quota/i, "We couldn't cover the network fee just now. Try again in a moment."],
  [/\bAA2\d\b|nonce|replacement underpriced|already known|user ?op(eration)? (was )?(reverted|failed)/i, "That didn't go through. Try again in a moment."],
  [/failed to fetch|networkerror|network request failed|timed? ?out|offline|ECONN|socket hang up|ENOTFOUND/i, "Can't reach the network. Check your connection and try again."],
  [/not (yet )?deployed/i, "This isn't switched on yet."],
  [/execution reverted|reverted/i, "That didn't go through. Check the details and try again."],
];

export const GENERIC_ERROR = "Something went wrong. Please try again.";

/** An error whose message is already written for the viewer; friendlyError passes it through untouched. */
export class FriendlyError extends Error {}

/** Collects everything readable from an error and the errors that caused it. */
function textOf(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; current && depth < 8 && !seen.has(current); depth++) {
    seen.add(current);
    if (typeof current === "string") {
      parts.push(current);
      break;
    }
    const e = current as { message?: unknown; shortMessage?: unknown; details?: unknown; cause?: unknown; name?: unknown };
    for (const key of ["shortMessage", "message", "details"] as const) {
      const v = e[key];
      if (typeof v === "string") parts.push(v);
    }
    current = e.cause;
  }
  return parts.join("\n");
}

/** Finds a revert payload in the text ("0x" + a 4-byte selector + args) and names the custom error. */
function customErrorName(text: string): string | undefined {
  for (const match of text.matchAll(/0x[0-9a-fA-F]{8,}/g)) {
    try {
      return decodeErrorResult({ abi: ERRORS, data: match[0] as `0x${string}` }).errorName;
    } catch {
      // not an error payload we know (an address, a hash, ...)
    }
  }
  return undefined;
}

/** What the email sign-in says when Privy refuses (its `privyErrorCode`). */
const BY_PRIVY_CODE: Record<string, string> = {
  invalid_credentials: "That code isn't right, or it expired. Check it and try again.",
  too_many_requests: "Too many tries. Wait a minute, then send a new code.",
  captcha_failure: "We couldn't check that you're human. Reload the page and try again.",
  disallowed_login_method: "Email sign-in is switched off right now.",
  allowlist_rejected: "This email isn't on the list for this test yet.",
};

export function friendlyError(error: unknown): string {
  if (error instanceof FriendlyError) return error.message;
  const code = (error as { privyErrorCode?: unknown } | null)?.privyErrorCode;
  if (typeof code === "string" && BY_PRIVY_CODE[code]) return BY_PRIVY_CODE[code];
  const text = textOf(error);

  const name = customErrorName(text) ?? /\b([A-Z][A-Za-z0-9]+)\(\)/.exec(text)?.[1];
  if (name && BY_NAME[name]) return BY_NAME[name];

  for (const [pattern, message] of BY_TEXT) if (pattern.test(text)) return message;
  return GENERIC_ERROR;
}
