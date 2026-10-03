import { describe, expect, it } from "vitest";
import { formatInt, formatUsd, parseUsd, usd, UNIT } from "./money";

describe("usd / formatUsd", () => {
  it("converts dollars to micro-dollars exactly", () => {
    expect(usd(1)).toBe(UNIT);
    expect(usd(12.5)).toBe(12_500_000n);
    expect(usd(0.000001)).toBe(1n);
  });

  it("hides .00 by default and shows cents when needed", () => {
    expect(formatUsd(usd(340))).toBe("$340");
    expect(formatUsd(usd(4.5))).toBe("$4.50");
    expect(formatUsd(usd(0.75))).toBe("$0.75");
    expect(formatUsd(0n)).toBe("$0");
  });

  it("always shows cents for aligned legends", () => {
    expect(formatUsd(usd(8), { cents: "always" })).toBe("$8.00");
    expect(formatUsd(usd(1284.6), { cents: "always" })).toBe("$1,284.60");
  });

  it("rounds half-up to the cent", () => {
    expect(formatUsd(1_005_000n, { cents: "always" })).toBe("$1.01");
    expect(formatUsd(1_004_999n, { cents: "always" })).toBe("$1.00");
  });

  it("groups thousands", () => {
    expect(formatUsd(usd(18_420))).toBe("$18,420");
    expect(formatUsd(usd(1_234_567))).toBe("$1,234,567");
  });

  it("formats compact and signed values", () => {
    expect(formatUsd(usd(1_200), { compact: true })).toBe("$1.2k");
    expect(formatUsd(usd(2_000), { compact: true })).toBe("$2k");
    expect(formatUsd(usd(5), { signed: true })).toBe("+$5");
    expect(formatUsd(-usd(5))).toBe("−$5");
  });
});

describe("parseUsd", () => {
  it("parses plain and decorated amounts", () => {
    expect(parseUsd("12.5")).toBe(12_500_000n);
    expect(parseUsd("$1,200")).toBe(1_200n * UNIT);
    expect(parseUsd("  7  ")).toBe(7n * UNIT);
    expect(parseUsd("0.000001")).toBe(1n);
  });

  it.each(["", "abc", "-5", "1.2.3", "1e3", "12.1234567", "$", ".5"])("rejects %j", (input) => {
    expect(parseUsd(input)).toBeNull();
  });
});

describe("formatInt", () => {
  it("groups digits", () => {
    expect(formatInt(0)).toBe("0");
    expect(formatInt(214)).toBe("214");
    expect(formatInt(1_000_000n)).toBe("1,000,000");
  });
});
