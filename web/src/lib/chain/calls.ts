import { encodeFunctionData, type Address, type Hex } from "viem";
import { ROLES, type Role } from "../roles";
import { battleAbi, characterAbi, juryAbi, questAbi, treasuryAbi, usdAbi, vaultAbi } from "./abis";
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
  };
}

export type CallBuilders = ReturnType<typeof createCalls>;
