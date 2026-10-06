import { encodeFunctionData, type Address, type Hex } from "viem";
import { ROLES, type Role } from "../roles";
import type { Split } from "../outcomes";
import { battleAbi, characterAbi, clipsAbi, juryAbi, questAbi, registryAbi, treasuryAbi, usdAbi, vaultAbi } from "./abis";
import type { Contracts } from "./config";

/** One call inside a (possibly batched) smart-account transaction. */
export interface Call {
  to: Address;
  data: Hex;
  value?: bigint;
}

/** Verdict enum in the contracts: None, Yes, No, Invalid. */
const VERDICT = { yes: 1, no: 2 } as const;

/** Screens hold ids as strings; the contracts want integers. Returns null for anything else. */
export function toId(value: string): bigint | null {
  return /^\d{1,20}$/.test(value) ? BigInt(value) : null;
}

/**
 * Builds the calls for every viewer action. Pure: no network, no wallet. Anything that moves money
 * is an approve for the exact amount plus the action, in ONE batch, so the viewer taps once and a
 * leftover allowance is never left behind.
 */
export function createCalls(c: Contracts) {
  const approve = (spender: Address, amount: bigint): Call => ({
    to: c.usd,
    data: encodeFunctionData({ abi: usdAbi, functionName: "approve", args: [spender, amount] }),
  });

  return {
    /** The $10 "practice gold" faucet (1 hour cooldown per address). */
    faucet: (): Call[] => [{ to: c.usd, data: encodeFunctionData({ abi: usdAbi, functionName: "faucet" }) }],

    mintCharacter: (role: Role, name: string): Call[] => [
      { to: c.character, data: encodeFunctionData({ abi: characterAbi, functionName: "mint", args: [ROLES.indexOf(role), name] }) },
    ],

    tip: (creatorId: bigint, amount: bigint, memo: string): Call[] => [
      approve(c.vault, amount),
      { to: c.vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [creatorId, amount, memo] }) },
    ],

    backQuest: (questId: bigint, amount: bigint): Call[] => [
      approve(c.quests, amount),
      { to: c.quests, data: encodeFunctionData({ abi: questAbi, functionName: "back", args: [questId, amount] }) },
    ],

    /** Points mode joins for free (amount must be 0); money mode approves and stakes. */
    joinBattle: (battleId: bigint, side: 0 | 1, amount: bigint, pointsMode: boolean): Call[] => {
      const join: Call = {
        to: c.battles,
        data: encodeFunctionData({ abi: battleAbi, functionName: "join", args: [battleId, side, pointsMode ? 0n : amount] }),
      };
      return pointsMode ? [join] : [approve(c.battles, amount), join];
    },

    claimQuest: (questId: bigint): Call[] => [
      { to: c.quests, data: encodeFunctionData({ abi: questAbi, functionName: "claim", args: [questId] }) },
    ],
    claimBattle: (battleId: bigint): Call[] => [
      { to: c.battles, data: encodeFunctionData({ abi: battleAbi, functionName: "claim", args: [battleId] }) },
    ],

    disputeQuest: (questId: bigint): Call[] => [
      { to: c.quests, data: encodeFunctionData({ abi: questAbi, functionName: "dispute", args: [questId] }) },
    ],

    /** Anyone can close a jury case once its voting time is up. */
    resolveJuryCase: (caseId: bigint): Call[] => [
      { to: c.jury, data: encodeFunctionData({ abi: juryAbi, functionName: "resolve", args: [caseId] }) },
    ],
    enlist: (): Call[] => [{ to: c.jury, data: encodeFunctionData({ abi: juryAbi, functionName: "enlist" }) }],
    leaveJury: (): Call[] => [{ to: c.jury, data: encodeFunctionData({ abi: juryAbi, functionName: "leave" }) }],
    voteJury: (caseId: bigint, vote: "yes" | "no"): Call[] => [
      { to: c.jury, data: encodeFunctionData({ abi: juryAbi, functionName: "vote", args: [caseId, VERDICT[vote]] }) },
    ],

    voteProposal: (proposalId: bigint, support: boolean): Call[] => [
      { to: c.treasury, data: encodeFunctionData({ abi: treasuryAbi, functionName: "vote", args: [proposalId, support] }) },
    ],
    proposeSpend: (creatorId: bigint, recipient: Address, amount: bigint, description: string): Call[] => [
      { to: c.treasury, data: encodeFunctionData({ abi: treasuryAbi, functionName: "propose", args: [creatorId, recipient, amount, description] }) },
    ],
    /** Put `bps` basis points of the treasury to work (0 = pull it all back). */
    proposeAllocation: (creatorId: bigint, bps: number, description: string): Call[] => [
      { to: c.treasury, data: encodeFunctionData({ abi: treasuryAbi, functionName: "proposeAllocation", args: [creatorId, bps, description] }) },
    ],
    executeProposal: (proposalId: bigint): Call[] => [
      { to: c.treasury, data: encodeFunctionData({ abi: treasuryAbi, functionName: "execute", args: [proposalId] }) },
    ],
    rebalanceTreasury: (creatorId: bigint): Call[] => [
      { to: c.vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "rebalance", args: [creatorId] }) },
    ],

    // ---- creators: the streamer side ---------------------------------------------------------------

    /** Opens a realm. The caller becomes its owner; one realm per account. */
    registerCreator: (handle: string, split: Split): Call[] => [
      { to: c.registry, data: encodeFunctionData({ abi: registryAbi, functionName: "register", args: [handle, split] }) },
    ],
    /** Takes effect after the 24 hour delay; applySplit then makes it current. */
    queueSplit: (creatorId: bigint, split: Split): Call[] => [
      { to: c.registry, data: encodeFunctionData({ abi: registryAbi, functionName: "queueSplit", args: [creatorId, split] }) },
    ],
    applySplit: (creatorId: bigint): Call[] => [
      { to: c.registry, data: encodeFunctionData({ abi: registryAbi, functionName: "applySplit", args: [creatorId] }) },
    ],
    setModerator: (creatorId: bigint, moderator: Address, enabled: boolean): Call[] => [
      { to: c.registry, data: encodeFunctionData({ abi: registryAbi, functionName: "setModerator", args: [creatorId, moderator, enabled] }) },
    ],

    /** `goalDeadline` is a unix timestamp in seconds. */
    createQuest: (creatorId: bigint, title: string, goalDeadline: bigint): Call[] => [
      { to: c.quests, data: encodeFunctionData({ abi: questAbi, functionName: "createQuest", args: [creatorId, title, goalDeadline] }) },
    ],
    /** `closeTime` is a unix timestamp in seconds; picks close then. */
    createBattle: (creatorId: bigint, question: string, sideA: string, sideB: string, closeTime: bigint, pointsMode: boolean): Call[] => [
      { to: c.battles, data: encodeFunctionData({ abi: battleAbi, functionName: "createBattle", args: [creatorId, question, sideA, sideB, closeTime, pointsMode] }) },
    ],

    /** Reports the result of a quest with a proof link; backers can dispute until the window ends. */
    proposeQuestOutcome: (questId: bigint, success: boolean, proofUri: string): Call[] => [
      { to: c.quests, data: encodeFunctionData({ abi: questAbi, functionName: "proposeOutcome", args: [questId, success, proofUri] }) },
    ],
    proposeBattleOutcome: (battleId: bigint, sideAWon: boolean, proofUri: string): Call[] => [
      { to: c.battles, data: encodeFunctionData({ abi: battleAbi, functionName: "proposeOutcome", args: [battleId, sideAWon, proofUri] }) },
    ],
    /** Anyone can finalize once the challenge window has passed. */
    finalizeQuest: (questId: bigint): Call[] => [
      { to: c.quests, data: encodeFunctionData({ abi: questAbi, functionName: "finalize", args: [questId] }) },
    ],
    finalizeBattle: (battleId: bigint): Call[] => [
      { to: c.battles, data: encodeFunctionData({ abi: battleAbi, functionName: "finalize", args: [battleId] }) },
    ],

    /** Moves everything the creator has earned out of the vault to `to`. */
    withdrawEarnings: (creatorId: bigint, to: Address): Call[] => [
      { to: c.vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "withdrawCreator", args: [creatorId, to] }) },
    ],

    // ---- clip bounties ---------------------------------------------------------------------------

    /**
     * Posts a clip bounty. A reward above zero is escrowed from the caller in the same batch; zero
     * waits for the community to fund it. Times are unix seconds: clips until `submitEnd`, then votes
     * until `voteEnd`.
     */
    createBounty: (creatorId: bigint, title: string, reward: bigint, submitEnd: bigint, voteEnd: bigint): Call[] => {
      const create: Call = {
        to: c.clips,
        data: encodeFunctionData({ abi: clipsAbi, functionName: "createBounty", args: [creatorId, title, reward, submitEnd, voteEnd] }),
      };
      return reward > 0n ? [approve(c.clips, reward), create] : [create];
    },
    /** Asks the community to fund clip bounties: a treasury payout to the clip board, voted on like any other. */
    askCommunity: (creatorId: bigint, amount: bigint, description: string): Call[] => [
      { to: c.treasury, data: encodeFunctionData({ abi: treasuryAbi, functionName: "propose", args: [creatorId, c.clips, amount, description] }) },
    ],
    /** Adds a passed community payout to a bounty's reward. */
    fundBounty: (bountyId: bigint, proposalId: bigint): Call[] => [
      { to: c.clips, data: encodeFunctionData({ abi: clipsAbi, functionName: "fundFromProposal", args: [bountyId, proposalId] }) },
    ],
    /** Sends a community payout no bounty used back to the treasury. */
    returnPayout: (proposalId: bigint): Call[] => [
      { to: c.clips, data: encodeFunctionData({ abi: clipsAbi, functionName: "returnProposalFunds", args: [proposalId] }) },
    ],
    submitClip: (bountyId: bigint, url: string): Call[] => [
      { to: c.clips, data: encodeFunctionData({ abi: clipsAbi, functionName: "submitClip", args: [bountyId, url] }) },
    ],
    voteClip: (clipId: bigint): Call[] => [
      { to: c.clips, data: encodeFunctionData({ abi: clipsAbi, functionName: "vote", args: [clipId] }) },
    ],
    hideClip: (clipId: bigint, hidden: boolean): Call[] => [
      { to: c.clips, data: encodeFunctionData({ abi: clipsAbi, functionName: "hide", args: [clipId, hidden] }) },
    ],
    /** Anyone can settle a bounty once voting has ended. */
    finalizeBounty: (bountyId: bigint): Call[] => [
      { to: c.clips, data: encodeFunctionData({ abi: clipsAbi, functionName: "finalize", args: [bountyId] }) },
    ],
  };
}

export type CallBuilders = ReturnType<typeof createCalls>;
