import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachedQuery, clearQueryCache } from "./gql-cache";

describe("the indexer query cache", () => {
  beforeEach(() => {
    clearQueryCache();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("asks the indexer once per query while the answer is fresh", async () => {
    const load = vi.fn(async () => ({ n: 1 }));
    expect(await cachedQuery("{ a }", {}, 10_000, load)).toEqual({ n: 1 });
    vi.advanceTimersByTime(9_000);
    await cachedQuery("{ a }", {}, 10_000, load);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await cachedQuery("{ a }", {}, 10_000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps different variables apart", async () => {
    const load = vi.fn(async () => 1);
    await cachedQuery("q", { h: "a" }, 10_000, load);
    await cachedQuery("q", { h: "b" }, 10_000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("sends one request for the same query asked at the same time", async () => {
    let resolve: (v: number) => void = () => undefined;
    const load = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const both = Promise.all([cachedQuery("q", {}, 10_000, load), cachedQuery("q", {}, 10_000, load)]);
    for (let i = 0; i < 10 && load.mock.calls.length === 0; i++) await Promise.resolve(); // it looks in Redis first
    resolve(7);
    expect(await both).toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("serves the last answer when the indexer refuses, and fails when there is none", async () => {
    await cachedQuery("q", {}, 10_000, async () => "old");
    vi.advanceTimersByTime(60_000);
    expect(await cachedQuery("q", {}, 10_000, async () => Promise.reject(new Error("429")))).toBe("old");
    await expect(cachedQuery("other", {}, 10_000, async () => Promise.reject(new Error("429")))).rejects.toThrow("429");
    vi.advanceTimersByTime(20 * 60_000); // too old to stand in any more
    await expect(cachedQuery("q", {}, 10_000, async () => Promise.reject(new Error("429")))).rejects.toThrow("429");
  });

  it("shares answers between instances through Redis", async () => {
    const store = new Map<string, string>();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://kv.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const [op, key, value] = JSON.parse(init.body) as string[];
        if (op === "SET") store.set(key!, value!);
        return new Response(JSON.stringify({ result: op === "GET" ? (store.get(key!) ?? null) : "OK" }));
      }),
    );
    await cachedQuery("q", {}, 10_000, async () => "from the indexer");
    await vi.waitFor(() => expect(store.size).toBe(1));
    clearQueryCache(); // another instance: nothing in its memory
    const load = vi.fn(async () => "asked again");
    expect(await cachedQuery("q", {}, 10_000, load)).toBe("from the indexer");
    expect(load).not.toHaveBeenCalled();
  });
});
