import { describe, expect, it } from "vitest";
import { formatEth, isGuid, memoBytes, tipValue, usdForWei, weiForUsd } from "./tip";

const USD = 1_000_000n;
const ETH = 10n ** 18n;

describe("pricing a tip in ETH", () => {
  it("asks for the smallest wei that is worth at least the dollars, the way the contract rounds", () => {
    const price = 2_701_890_000n; // $2,701.89
    const wei = weiForUsd(5n * USD, price);
    expect(usdForWei(wei, price)).toBeGreaterThanOrEqual(5n * USD);
    expect(usdForWei(wei - 1n, price)).toBeLessThan(5n * USD);
    expect(weiForUsd(2_500n * USD, 2_500n * USD)).toBe(ETH);
  });

  it("refuses to price without a price", () => {
    expect(() => weiForUsd(USD, 0n)).toThrow();
  });

  it("sends the tip plus the fee plus a refundable 10% margin on the fee", () => {
    expect(tipValue(ETH, 1_000n)).toBe(ETH + 1_100n);
  });

  it("formats small ETH amounts readably", () => {
    expect(formatEth(1_850_550_000_000_000n)).toBe("0.00185");
    expect(formatEth(102_618_002_203_076n)).toBe("0.000102");
    expect(formatEth(ETH)).toBe("1");
    expect(formatEth(0n)).toBe("0");
  });

  it("counts the memo in bytes and checks LayerZero ids", () => {
    expect(memoBytes("gg")).toBe(2);
    expect(memoBytes("é")).toBe(2);
    expect(isGuid(`0x${"a".repeat(64)}`)).toBe(true);
    expect(isGuid("0x1234")).toBe(false);
  });
});
