import { describe, expect, it } from "vitest";
import { behindText, indexerLag, STALL_BLOCKS } from "./status";

describe("indexerLag", () => {
  const head = { number: 1_000_000, timestamp: 1_791_131_411 };

  it("is not stalled when the indexer is a few blocks behind", () => {
    expect(indexerLag(999_990, head.timestamp - 3, head)).toEqual({
      processedBlock: 999_990,
      chainHead: 1_000_000,
      behindBlocks: 10,
      behindSeconds: 3,
      stalled: false,
    });
  });

  it("calls it stalled when the last processed block is minutes old", () => {
    // what happened on testnet: the indexer stopped at 68118860 while the chain moved on for hours
    const lag = indexerLag(68_118_860, 1_791_118_000, { number: 68_166_508, timestamp: 1_791_132_400 });
    expect(lag).toMatchObject({ behindBlocks: 47_648, behindSeconds: 14_400, stalled: true });
  });

  it("falls back to counting blocks when the time of the last block is unknown", () => {
    expect(indexerLag(head.number - STALL_BLOCKS, null, head).stalled).toBe(false);
    expect(indexerLag(head.number - STALL_BLOCKS - 1, null, head).stalled).toBe(true);
    expect(indexerLag(0, null, head).stalled).toBe(true); // nothing indexed yet
  });

  it("does not raise an alarm when the chain itself could not be read", () => {
    expect(indexerLag(5, 1, null)).toEqual({ processedBlock: 5, chainHead: null, behindBlocks: null, behindSeconds: null, stalled: false });
  });

  it("never reports a negative lag (the indexer can be a block past a cached head)", () => {
    expect(indexerLag(head.number + 2, head.timestamp + 1, head)).toMatchObject({ behindBlocks: 0, behindSeconds: 0, stalled: false });
  });
});

describe("behindText", () => {
  it("reads the way a person would say it", () => {
    expect(behindText(20)).toBe("1 minute");
    expect(behindText(125)).toBe("2 minutes");
    expect(behindText(3 * 3600)).toBe("3 hours");
    expect(behindText(3 * 86_400)).toBe("3 days");
  });
});
