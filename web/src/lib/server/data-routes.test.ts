import { beforeAll, describe, expect, it } from "vitest";
import type { Mine } from "../data/mine";
import type { World } from "../data/types";
import { fromWire } from "../data/wire";
import { RateLimiter } from "./ratelimit";

// These run against the sample world and with no indexer configured, like a fresh checkout.
let routes: typeof import("./data-routes");

beforeAll(async () => {
  delete process.env.NEXT_PUBLIC_SAMPLE_DATA;
  delete process.env.INDEXER_GRAPHQL_URL;
  routes = await import("./data-routes");
});

const get = (path: string, ip = "9.9.9.9") => new Request(`http://localhost${path}`, { headers: { "x-forwarded-for": ip } });
const fresh = () => new RateLimiter(1_000, 60_000);

describe("GET /api/realm", () => {
  it("returns a realm with money as real bigint, not text", async () => {
    const res = await routes.handleRealm(get("/api/realm?handle=neonblade"), fresh());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const world = fromWire<World>(await res.text());
    expect(world?.creator.handleKey).toBe("neonblade");
    expect(typeof world?.creator.creatorBalance).toBe("bigint");
    expect(world?.quests.length).toBeGreaterThan(0);
  });

  it("is case-insensitive about the handle", async () => {
    expect((await routes.handleRealm(get("/api/realm?handle=NeonBlade"), fresh())).status).toBe(200);
  });

  it("answers 404 for a realm that does not exist", async () => {
    expect((await routes.handleRealm(get("/api/realm?handle=nobody"), fresh())).status).toBe(404);
  });

  it("refuses anything that is not a handle, before it goes near the data", async () => {
    for (const bad of ["", "a", "../x", "has space", "x".repeat(33), "a-b", "a%00b", "<script>"]) {
      const res = await routes.handleRealm(get(`/api/realm?handle=${encodeURIComponent(bad)}`), fresh());
      expect(res.status, bad).toBe(400);
    }
    expect((await routes.handleRealm(get("/api/realm"), fresh())).status).toBe(400);
  });
});

describe("GET /api/mine", () => {
  const address = "0xe2423bDEe474D88F0ec7fA827cF1a39E0FE70864";

  it("returns an empty history when there is nothing indexed to read", async () => {
    const res = await routes.handleMine(get(`/api/mine?address=${address}`), fresh());
    expect(res.status).toBe(200);
    const mine = fromWire<Mine>(await res.text());
    expect(mine).toMatchObject({ backed: {}, picks: {}, claimed: {}, jury: {}, proposalVotes: {}, tips: [], xpLog: [] });
  });

  it("refuses something that is not an account address", async () => {
    for (const bad of ["", "0x123", "karambol", `${address}00`, "../etc"]) {
      expect((await routes.handleMine(get(`/api/mine?address=${encodeURIComponent(bad)}`), fresh())).status, bad).toBe(400);
    }
  });
});

describe("GET /api/indexer/status", () => {
  it("says the live data is not set up when there is no indexer", async () => {
    expect((await routes.handleStatus(get("/api/indexer/status"), fresh(), async () => null)).status).toBe(503);
  });
});

describe("rate limiting", () => {
  it("limits each visitor on its own and says when to come back", async () => {
    const limiter = new RateLimiter(2, 60_000);
    const hit = () => routes.handleRealm(get("/api/realm?handle=neonblade", "5.5.5.5"), limiter);
    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(200);
    const blocked = await hit();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await routes.handleRealm(get("/api/realm?handle=neonblade", "6.6.6.6"), limiter)).status).toBe(200);
  });
});
