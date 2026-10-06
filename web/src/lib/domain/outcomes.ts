import { BPS, type Usd } from "../utils/money";

/** Mirrors SplitVault / QuestEscrow / PredictionBattle so previews are exact. */

export const QUEST_FAIL_TREASURY_BPS = 1_000n; // 10% of a failed quest's pool
export const BATTLE_TREASURY_CUT_BPS = 200n; // 2% of the losing side

export interface Split {
  creatorBps: number;
  treasuryBps: number;
  communityBps: number;
}

export interface SplitAmounts {
  creator: Usd;
  treasury: Usd;
  community: Usd;
}

/** SplitVault.deposit: cuts round down, dust goes to the creator. */
export function splitAmount(amount: Usd, split: Split): SplitAmounts {
  const treasury = (amount * BigInt(split.treasuryBps)) / BPS;
  const community = (amount * BigInt(split.communityBps)) / BPS;
  return { creator: amount - treasury - community, treasury, community };
}

export interface QuestOutcomes {
  /** quest completed: the pool flows through the creator's split vault */
  complete: SplitAmounts;
  /** quest failed: 90% refundable to backers, 10% to the community treasury */
  failed: { refund: Usd; toTreasury: Usd };
  /** jury tie / nobody judged: full refund */
  void: { refund: Usd };
}

export function questOutcomes(amount: Usd, split: Split): QuestOutcomes {
  const toTreasury = (amount * QUEST_FAIL_TREASURY_BPS) / BPS;
  return {
    complete: splitAmount(amount, split),
    failed: { refund: amount - toTreasury, toTreasury },
    void: { refund: amount },
  };
}

/**
 * Estimated payout if `side` wins after joining with `amount`. The losing pool
 * can still change while the battle is open, so this is an estimate.
 */
export function battleEstimate(amount: Usd, side: 0 | 1, pools: readonly [Usd, Usd]): { payout: Usd; profit: Usd } {
  const own = pools[side] + amount;
  const losing = pools[side === 0 ? 1 : 0];
  if (losing === 0n) return { payout: amount, profit: 0n }; // no counterparty -> refund
  const winnings = losing - (losing * BATTLE_TREASURY_CUT_BPS) / BPS;
  const profit = (winnings * amount) / own;
  return { payout: amount + profit, profit };
}

/** Share (0–1) of the combined pool sitting on side A, for the tug bar. */
export function poolShare(pools: readonly [Usd, Usd]): number {
  const total = pools[0] + pools[1];
  if (total === 0n) return 0.5;
  return Number((pools[0] * 10_000n) / total) / 10_000;
}
