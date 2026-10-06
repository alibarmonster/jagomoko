import type { PublicClient } from "viem";
import { lstAbi, poolAbi, swapAbi, vaultAbi, yieldVaultAbi } from "./chain/abis";
import type { Contracts } from "./chain/config";

/**
 * The Community Pool (contract v2): where guild treasuries earn yield. A guild votes how much of its
 * treasury goes in (Allocate, up to 50%); jagomoko's curator splits the pool between token staking
 * (an ERC-4626 vault over mUSD) and liquid staking (mUSD swapped to mMON and staked as stMON).
 * Everything here is read live from the chain; the index only records money going in and out.
 */

export interface PoolSnapshot {
  /** the share of the pool the curator wants in liquid staking */
  lstBps: number;
  /** after an emergency exit: everything idle */
  parked: boolean;
  idle: bigint;
  /** what the token staking leg pays out now */
  stable: bigint;
  /** what the liquid staking leg pays out now (after its exit fees) */
  lst: bigint;
  stableAprBps: number;
  lstAprBps: number;
  /** USD per MON, 8 decimals */
  monPrice: bigint;
  swapFeeBps: number;
  instantFeeBps: number;
  unbondingSeconds: number;
}

/** One guild's treasury, as the SplitVault counts it. */
export interface TreasuryPool {
  liquid: bigint;
  /** what the guild's pool shares pay out now */
  invested: bigint;
  /** the share of the treasury the guild voted to put in */
  targetBps: number;
}

const BPS = 10_000n;
/** SplitVault.MIN_REBALANCE_BPS: a smaller move is skipped on chain */
const MIN_MOVE_BPS = 100n;

export const poolTotal = (p: PoolSnapshot) => p.idle + p.stable + p.lst;

/** How the pool is split right now, as fractions of it (idle money counts with token staking). */
export function mixOf(p: PoolSnapshot): { stable: number; lst: number } {
  const total = poolTotal(p);
  if (total === 0n) return { stable: 1 - p.lstBps / 10_000, lst: p.lstBps / 10_000 };
  const lst = Number((p.lst * 10_000n) / total) / 10_000;
  return { stable: 1 - lst, lst };
}

/** The pool's yield right now, weighted by what sits in each leg (the target mix while empty). */
export function blendedAprBps(p: PoolSnapshot): number {
  const { stable, lst } = mixOf(p);
  return Math.round(stable * p.stableAprBps + lst * p.lstAprBps);
}

/** 800 -> "8%", 1050 -> "10.5%" */
export function formatApr(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

/**
 * Roughly what setting the liquid staking share to `targetBps` moves once the pool rebalances: money
 * swapped to mMON and staked (positive) or unstaked and swapped back (negative). Rough because the
 * swap and the exit fees shift it a little.
 */
export function mixMove(p: PoolSnapshot, targetBps: number): bigint {
  return (poolTotal(p) * BigInt(targetBps)) / BPS - p.lst;
}

/** "$0.05" from an 8-decimal price */
export function formatPrice8(price: bigint): string {
  const cents = Number(price) / 1e8;
  return `$${cents >= 1 ? cents.toFixed(2) : cents.toPrecision(2)}`;
}

/** Would SplitVault.rebalance move this treasury? (It skips drift under 1%, but always leaves on a 0 target.) */
export function needsRebalance(t: TreasuryPool): boolean {
  const total = t.liquid + t.invested;
  if (total === 0n) return false;
  if (t.targetBps === 0) return t.invested > 0n;
  const target = (total * BigInt(t.targetBps)) / BPS;
  const drift = target > t.invested ? target - t.invested : t.invested - target;
  return drift !== 0n && drift >= (total * MIN_MOVE_BPS) / BPS;
}

/** The share of the treasury that is in the pool right now, in basis points. */
export function investedBps(t: TreasuryPool): number {
  const total = t.liquid + t.invested;
  return total === 0n ? 0 : Number((t.invested * BPS) / total);
}

/** Reads the pool (and one guild's treasury) in a single multicall. */
export async function readPool(
  client: Pick<PublicClient, "multicall">,
  c: Contracts,
  creatorId?: bigint,
): Promise<{ pool: PoolSnapshot; treasury: TreasuryPool | null }> {
  const base = [
    { address: c.pool, abi: poolAbi, functionName: "lstBps" },
    { address: c.pool, abi: poolAbi, functionName: "parked" },
    { address: c.pool, abi: poolAbi, functionName: "idleAssets" },
    { address: c.pool, abi: poolAbi, functionName: "stableValue" },
    { address: c.pool, abi: poolAbi, functionName: "lstValue" },
    { address: c.yieldVault, abi: yieldVaultAbi, functionName: "aprBps" },
    { address: c.lst, abi: lstAbi, functionName: "aprBps" },
    { address: c.lst, abi: lstAbi, functionName: "instantFeeBps" },
    { address: c.lst, abi: lstAbi, functionName: "unbondingPeriod" },
    { address: c.swap, abi: swapAbi, functionName: "price" },
    { address: c.swap, abi: swapAbi, functionName: "feeBps" },
  ] as const;
  const [lstBps, parked, idle, stable, lst, stableApr, lstApr, instantFee, unbonding, price, swapFee] = await client.multicall({
    contracts: base,
    allowFailure: false,
  });
  const pool: PoolSnapshot = {
    lstBps: Number(lstBps),
    parked,
    idle,
    stable,
    lst,
    stableAprBps: Number(stableApr),
    lstAprBps: Number(lstApr),
    monPrice: price,
    swapFeeBps: Number(swapFee),
    instantFeeBps: Number(instantFee),
    unbondingSeconds: Number(unbonding),
  };
  if (creatorId === undefined) return { pool, treasury: null };

  const [liquid, invested, targetBps] = await client.multicall({
    contracts: [
      { address: c.vault, abi: vaultAbi, functionName: "treasuryBalance", args: [creatorId] },
      { address: c.vault, abi: vaultAbi, functionName: "investedValue", args: [creatorId] },
      { address: c.vault, abi: vaultAbi, functionName: "treasuryTargetBps", args: [creatorId] },
    ] as const,
    allowFailure: false,
  });
  return { pool, treasury: { liquid, invested, targetBps: Number(targetBps) } };
}

/**
 * What the sample world shows: a 70 / 30 pool, and NeonBlade's treasury ($24.86, lib/data/sample.ts)
 * with 40% in it: $9.94 went in, worth $10.02 now.
 */
export const SAMPLE_POOL: { pool: PoolSnapshot; treasury: TreasuryPool } = {
  pool: {
    lstBps: 3_000,
    parked: false,
    idle: 0n,
    stable: 420_000_000n,
    lst: 179_280_000n,
    stableAprBps: 800,
    lstAprBps: 1_000,
    monPrice: 5_000_000n,
    swapFeeBps: 10,
    instantFeeBps: 20,
    unbondingSeconds: 600,
  },
  treasury: { liquid: 14_920_000n, invested: 10_020_000n, targetBps: 4_000 },
};
