import { UNIT, type Usd } from "../utils/money";
import type { Role } from "./roles";

/** Mirrors Character.sol so previews match what the contracts will grant. */

export const XP_PER_USD = 10n;
export const SPECIALTY_BONUS_BPS = 15_000n;
export const XP_PER_LEVEL_UNIT = 100n;

export function bigSqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("sqrt of negative");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** level = floor(sqrt(xp / 100)) + 1 */
export const levelForXp = (xp: bigint): number => Number(bigSqrt(xp / XP_PER_LEVEL_UNIT)) + 1;

/** XP needed to reach `level` (level 1 = 0). */
export const xpForLevel = (level: number): bigint => {
  const l = BigInt(Math.max(1, level) - 1);
  return XP_PER_LEVEL_UNIT * l * l;
};

export function levelProgress(xp: bigint) {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const span = ceil - floor;
  const into = xp - floor;
  const pct = span === 0n ? 0 : Number((into * 10_000n) / span) / 10_000;
  return { level, floor, ceil, span, into, pct };
}

/** sqrt(xp): treasury voting weight, dampens whales. */
export const votingWeight = (xp: bigint): bigint => bigSqrt(xp);

const bonus = (xp: bigint, specialty: boolean) => (specialty ? (xp * SPECIALTY_BONUS_BPS) / 10_000n : xp);

export const xpForBack = (amount: Usd, role: Role): bigint => bonus((amount * XP_PER_USD) / UNIT, role === "Knight");
export const xpForTip = (amount: Usd): bigint => (amount * XP_PER_USD) / UNIT;
export const xpForJoin = (role: Role): bigint => bonus(5n, role === "Seer");
export const xpForBattleWin = (profit: Usd, role: Role): bigint =>
  bonus(50n + (profit * XP_PER_USD) / UNIT, role === "Seer");
export const xpForJury = (role: Role): bigint => bonus(100n, role === "Judge");

// clip bounties (contracts/src/ClipBoard.sol)
export const xpForClip = (role: Role): bigint => bonus(20n, role === "Bard");
/** to the clip's author for each of its first 20 votes */
export const xpPerClipVote = (role: Role): bigint => bonus(5n, role === "Bard");
/** to the voter (Governance: no role bonus) */
export const CLIP_VOTE_XP = 5n;
/** to the winner, when the reward is worth at least a dollar */
export const xpForClipWin = (role: Role): bigint => bonus(300n, role === "Bard");
