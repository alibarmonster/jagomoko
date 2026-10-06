import { describe, expect, it } from "vitest";
import { getAddress, type Address } from "viem";
import type { Contracts } from "./chain/config";
import { blendedAprBps, formatApr, formatPrice8, investedBps, mixMove, mixOf, needsRebalance, poolTotal, readPool, type PoolSnapshot } from "./pool";

const USD = 1_000_000n;
const base: PoolSnapshot = {
  lstBps: 3_000,
  parked: false,
  idle: 0n,
  stable: 70n * USD,
  lst: 30n * USD,
  stableAprBps: 800,
  lstAprBps: 1_000,
  monPrice: 5_000_000n,
  swapFeeBps: 10,
  instantFeeBps: 20,
  unbondingSeconds: 600,
};

describe("the pool's numbers", () => {
  it("splits by what each leg holds, and by the target while empty", () => {
    expect(poolTotal(base)).toBe(100n * USD);
    expect(mixOf(base)).toEqual({ stable: 0.7, lst: 0.3 });
    expect(mixOf({ ...base, stable: 0n, lst: 0n })).toEqual({ stable: 0.7, lst: 0.3 });
  });

  it("weights the yield by the legs", () => {
    expect(blendedAprBps(base)).toBe(860);
    expect(formatApr(860)).toBe("8.6%");
    expect(formatApr(800)).toBe("8%");
    expect(formatPrice8(5_000_000n)).toBe("$0.050");
    expect(formatPrice8(250_000_000n)).toBe("$2.50");
  });

  it("estimates what a new liquid staking share moves", () => {
    expect(mixMove(base, 4_000)).toBe(10n * USD); // swap and stake $10 more
    expect(mixMove(base, 2_000)).toBe(-10n * USD); // unstake $10 and swap it back
    expect(mixMove(base, 3_000)).toBe(0n);
    expect(mixMove({ ...base, idle: 0n, stable: 0n, lst: 0n }, 5_000)).toBe(0n);
  });

  it("knows when a treasury is off its target by enough to rebalance", () => {
    expect(needsRebalance({ liquid: 60n * USD, invested: 40n * USD, targetBps: 4_000 })).toBe(false);
    expect(needsRebalance({ liquid: 100n * USD, invested: 0n, targetBps: 4_000 })).toBe(true);
    expect(needsRebalance({ liquid: 59_500_000n, invested: 40_500_000n, targetBps: 4_000 })).toBe(false); // 0.5% drift
    expect(needsRebalance({ liquid: 90n * USD, invested: 10n * USD, targetBps: 0 })).toBe(true);
    expect(needsRebalance({ liquid: 0n, invested: 0n, targetBps: 4_000 })).toBe(false);
    expect(investedBps({ liquid: 60n * USD, invested: 40n * USD, targetBps: 4_000 })).toBe(4_000);
  });
});

describe("readPool", () => {
  const addr = (n: number): Address => getAddress(`0x${n.toString(16).padStart(40, "0")}`);
  const C = { pool: addr(11), lst: addr(13), swap: addr(14), yieldVault: addr(2), vault: addr(5) } as Contracts;

  it("reads the pool and the guild's treasury in two multicalls", async () => {
    const calls: { address: string; functionName: string; args?: readonly unknown[] }[][] = [];
    const answers = [
      [3_000, false, 0n, 70n * USD, 30n * USD, 800n, 1_000n, 20n, 600n, 5_000_000n, 10n],
      [60n * USD, 40n * USD, 4_000],
    ];
    const client = {
      multicall: async ({ contracts }: { contracts: readonly { address: string; functionName: string; args?: readonly unknown[] }[] }) => {
        calls.push([...contracts]);
        return answers[calls.length - 1];
      },
    };
    const r = await readPool(client as never, C, 1n);
    expect(r.pool).toEqual(base);
    expect(r.treasury).toEqual({ liquid: 60n * USD, invested: 40n * USD, targetBps: 4_000 });
    expect(calls[0]!.map((c) => c.functionName)).toContain("lstValue");
    expect(calls[1]!.every((c) => c.address === C.vault && c.args?.[0] === 1n)).toBe(true);

    calls.length = 0;
    expect((await readPool(client as never, C)).treasury).toBeNull();
    expect(calls).toHaveLength(1);
  });
});
