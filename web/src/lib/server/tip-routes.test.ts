import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import type { TipSource } from "../chain/config";
import { RateLimiter } from "./ratelimit";
import { handleTipQuote, handleTipStatus, type SenderReader } from "./tip-routes";

const USD = 1_000_000n;
const SOURCE: TipSource = {
  chainId: 11155111,
  eid: 40161,
  name: "Ethereum Sepolia",
  short: "Sepolia",
  explorer: "https://sepolia.etherscan.io",
  tipSender: getAddress("0x00000000000000000000000000000000000000aa"),
};

function reader(over: Partial<SenderReader> = {}): { reader: SenderReader; seen: { memo?: string; wei?: bigint } } {
  const seen: { memo?: string; wei?: bigint } = {};
  return {
    seen,
    reader: {
      usdValue: async () => 2_500n * USD,
      quote: async (_s, wei, _c, memo) => {
        seen.memo = memo;
        seen.wei = wei;
        return { fee: 100_000_000_000_000n, usd: 5n * USD };
      },
      limits: async () => ({ minUsd: USD, maxUsd: 100n * USD }),
      ...over,
    },
  };
}

const get = (path: string) => new Request(`http://localhost${path}`);
const limiter = () => new RateLimiter(100, 60_000);

describe("/api/tip-quote", () => {
  it("prices the tip in ETH and quotes the fee with a stand-in memo of the same length", async () => {
    const { reader: r, seen } = reader();
    const res = await handleTipQuote(get("/api/tip-quote?chain=11155111&creator=1&usd=5000000&memo=12"), limiter(), () => r, [SOURCE]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      chainId: 11155111,
      usdPerEth: "2500000000",
      wei: "2000000000000000",
      fee: "100000000000000",
      usd: "5000000",
      minUsd: "1000000",
      maxUsd: "100000000",
    });
    expect(seen.memo).toBe("x".repeat(12));
    expect(seen.wei).toBe(2_000_000_000_000_000n);
  });

  it("refuses unknown chains and bad input before reading anything", async () => {
    let reads = 0;
    const counting = () => {
      reads += 1;
      return reader().reader;
    };
    const bad = [
      "/api/tip-quote?chain=1&creator=1&usd=5000000&memo=0",
      "/api/tip-quote?chain=11155111&creator=x&usd=5000000&memo=0",
      "/api/tip-quote?chain=11155111&creator=1&usd=0&memo=0",
      "/api/tip-quote?chain=11155111&creator=1&usd=2000000000&memo=0",
      "/api/tip-quote?chain=11155111&creator=1&usd=5000000&memo=201",
    ];
    for (const path of bad) expect((await handleTipQuote(get(path), limiter(), counting, [SOURCE])).status).toBeGreaterThanOrEqual(400);
    expect(reads).toBe(0);
  });

  it("says the chain can't be read when it can't", async () => {
    const { reader: r } = reader({ usdValue: async () => Promise.reject(new Error("down")) });
    const res = await handleTipQuote(get("/api/tip-quote?chain=11155111&creator=1&usd=5000000&memo=0"), limiter(), () => r, [SOURCE]);
    expect(res.status).toBe(503);
  });

  it("is rate limited per visitor", async () => {
    const l = new RateLimiter(1, 60_000);
    const { reader: r } = reader();
    const path = "/api/tip-quote?chain=11155111&creator=1&usd=5000000&memo=0";
    expect((await handleTipQuote(get(path), l, () => r, [SOURCE])).status).toBe(200);
    expect((await handleTipQuote(get(path), l, () => r, [SOURCE])).status).toBe(429);
  });
});

describe("/api/tip-status", () => {
  it("only takes a LayerZero guid", async () => {
    const res = await handleTipStatus(get("/api/tip-status?guid=0x12"), limiter(), async () => ({ status: "landed" }));
    expect(res.status).toBe(400);
  });

  it("answers pending without an index to ask", async () => {
    const res = await handleTipStatus(get(`/api/tip-status?guid=0x${"ab".repeat(32)}`), limiter(), async () => ({ status: "landed" }));
    expect(await res.json()).toEqual({ status: "pending" });
  });
});
