import { describe, expect, it } from "vitest";
import { usd } from "../utils/money";
import { bigSqrt, levelForXp, levelProgress, votingWeight, xpForBack, xpForBattleWin, xpForJoin, xpForJury, xpForLevel, xpForTip } from "./xp";

// These mirror contracts/src/Character.sol and the contract test suite.
describe("levels", () => {
  it("matches Character.levelForXP", () => {
    expect(levelForXp(0n)).toBe(1);
    expect(levelForXp(99n)).toBe(1);
    expect(levelForXp(100n)).toBe(2);
    expect(levelForXp(1_600n)).toBe(5);
    expect(levelForXp(3_740n)).toBe(7);
  });

  it("xpForLevel is the inverse threshold", () => {
    for (let level = 1; level <= 30; level++) {
      const xp = xpForLevel(level);
      expect(levelForXp(xp)).toBe(level);
      if (level > 1) expect(levelForXp(xp - 1n)).toBe(level - 1);
    }
  });

  it("reports progress inside a level", () => {
    const p = levelProgress(225n); // level 2: 100..400
    expect(p.level).toBe(2);
    expect(p.floor).toBe(100n);
    expect(p.ceil).toBe(400n);
    expect(p.into).toBe(125n);
    expect(p.span).toBe(300n);
    expect(p.pct).toBeCloseTo(125 / 300, 3);
  });

  it("level 1 starts at zero", () => {
    expect(levelProgress(0n).pct).toBe(0);
  });
});

describe("integer square root", () => {
  it("is exact on squares and floors otherwise", () => {
    for (const n of [0n, 1n, 2n, 3n, 4n, 15n, 16n, 17n, 10n ** 30n]) {
      const r = bigSqrt(n);
      expect(r * r <= n && (r + 1n) * (r + 1n) > n).toBe(true);
    }
  });
  it("rejects negatives", () => {
    expect(() => bigSqrt(-1n)).toThrow();
  });
  it("votingWeight dampens large XP", () => {
    expect(votingWeight(400n)).toBe(20n);
    expect(votingWeight(40_000n)).toBe(200n); // 100x the xp, 10x the weight
  });
});

describe("xp previews match the contracts", () => {
  it("tips grant 10 XP per dollar", () => {
    expect(xpForTip(usd(10))).toBe(100n);
    expect(xpForTip(usd(0.99))).toBe(9n);
  });

  it("Knights get +50% when backing a quest", () => {
    expect(xpForBack(usd(10), "Knight")).toBe(150n);
    expect(xpForBack(usd(5), "Knight")).toBe(75n);
    expect(xpForBack(usd(10), "Seer")).toBe(100n);
  });

  it("joining a battle: 5 XP, 7 for a Seer (floor of 7.5)", () => {
    expect(xpForJoin("Knight")).toBe(5n);
    expect(xpForJoin("Seer")).toBe(7n);
  });

  it("winning a battle: 50 + 10 XP per dollar of profit, Seers +50%", () => {
    expect(xpForBattleWin(usd(12.25), "Knight")).toBe(172n);
    expect(xpForBattleWin(0n, "Seer")).toBe(75n);
  });

  it("honest jurors: 100 XP, 150 for a Judge", () => {
    expect(xpForJury("Judge")).toBe(150n);
    expect(xpForJury("Bard")).toBe(100n);
  });
});
