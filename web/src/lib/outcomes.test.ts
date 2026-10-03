import { describe, expect, it } from "vitest";
import { usd } from "./money";
import { battleEstimate, poolShare, questOutcomes, splitAmount, type Split } from "./outcomes";

const SPLIT: Split = { creatorBps: 8_000, treasuryBps: 1_500, communityBps: 500 };

// These mirror the numbers asserted in contracts/test/*.t.sol.
describe("splitAmount (SplitVault.deposit)", () => {
  it("splits a $10 tip 8 / 1.5 / 0.5", () => {
    expect(splitAmount(usd(10), SPLIT)).toEqual({ creator: usd(8), treasury: usd(1.5), community: usd(0.5) });
  });

  it("always conserves the amount and sends dust to the creator", () => {
    for (const cents of [1, 3, 7, 33, 99, 101, 12_345]) {
      const amount = usd(cents / 100) + 1n; // include sub-cent dust
      const s = splitAmount(amount, SPLIT);
      expect(s.creator + s.treasury + s.community).toBe(amount);
      expect(s.treasury).toBe((amount * 1_500n) / 10_000n);
      expect(s.creator).toBeGreaterThanOrEqual(0n);
    }
  });

  it("works for any valid split", () => {
    const odd: Split = { creatorBps: 5_000, treasuryBps: 0, communityBps: 5_000 };
    const s = splitAmount(usd(7.77), odd);
    expect(s.treasury).toBe(0n);
    expect(s.creator + s.community).toBe(usd(7.77));
  });
});

describe("questOutcomes (QuestEscrow)", () => {
  it("a failed $10 quest refunds 90% and sends 10% to the treasury", () => {
    const o = questOutcomes(usd(10), SPLIT);
    expect(o.failed).toEqual({ refund: usd(9), toTreasury: usd(1) });
  });

  it("a completed quest flows through the creator's split", () => {
    expect(questOutcomes(usd(10), SPLIT).complete).toEqual({ creator: usd(8), treasury: usd(1.5), community: usd(0.5) });
  });

  it("a void quest refunds everything", () => {
    expect(questOutcomes(usd(10), SPLIT).void.refund).toBe(usd(10));
  });

  it("refund + treasury cut never exceeds the pledge", () => {
    for (const a of [1n, 7n, 999_999n, usd(3.33), usd(100)]) {
      const o = questOutcomes(a, SPLIT);
      expect(o.failed.refund + o.failed.toTreasury).toBe(a);
    }
  });
});

describe("battleEstimate (PredictionBattle)", () => {
  it("matches the contract test: alice $10 vs a $50 losing side with $30 already on her side", () => {
    // contracts/test/PredictionBattle.t.sol::test_winnersSplitLosingPool
    const e = battleEstimate(usd(10), 0, [usd(30), usd(50)]);
    expect(e.profit).toBe(usd(12.25));
    expect(e.payout).toBe(usd(22.25));
  });

  it("refunds when there is no counterparty", () => {
    // side 1 has the player, side 0 (the would-be losers) is empty
    expect(battleEstimate(usd(10), 1, [0n, usd(40)])).toEqual({ payout: usd(10), profit: 0n });
  });

  it("is symmetric between sides", () => {
    const a = battleEstimate(usd(5), 0, [usd(20), usd(60)]);
    const b = battleEstimate(usd(5), 1, [usd(60), usd(20)]);
    expect(a).toEqual(b);
  });

  it("joining a bigger pool earns a smaller share", () => {
    const small = battleEstimate(usd(10), 0, [usd(10), usd(100)]);
    const big = battleEstimate(usd(10), 0, [usd(500), usd(100)]);
    expect(small.profit).toBeGreaterThan(big.profit);
  });
});

describe("poolShare", () => {
  it("is 50/50 when empty and proportional otherwise", () => {
    expect(poolShare([0n, 0n])).toBe(0.5);
    expect(poolShare([usd(182), usd(96)])).toBeCloseTo(182 / 278, 3);
    expect(poolShare([usd(10), 0n])).toBe(1);
  });
});
