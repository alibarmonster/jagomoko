import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { kvConfigured } from "./kv";
import { RedisTestQueue } from "./overlay-tests";
import { RedisProfileStore, type Profile } from "./profiles";

/** A stand-in for the Upstash REST API: the handful of commands the app uses, in memory. */
function fakeUpstash() {
  const strings = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const run = (cmd: (string | number)[]): unknown => {
    const [op, key, ...args] = cmd.map(String);
    switch (op) {
      case "GET":
        return strings.get(key!) ?? null;
      case "SET":
        strings.set(key!, args[0]!);
        return "OK";
      case "INCR": {
        const n = Number(strings.get(key!) ?? 0) + 1;
        strings.set(key!, String(n));
        return n;
      }
      case "RPUSH":
        lists.set(key!, [...(lists.get(key!) ?? []), args[0]!]);
        return lists.get(key!)!.length;
      case "LTRIM": {
        const list = lists.get(key!) ?? [];
        lists.set(key!, list.slice(Math.max(0, list.length + Number(args[0]))));
        return "OK";
      }
      case "PEXPIRE":
        return 1;
      case "LRANGE":
        return lists.get(key!) ?? [];
      default:
        throw new Error(`unexpected ${op}`);
    }
  };
  return vi.fn(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as (string | number)[] | (string | number)[][];
    const result = url.endsWith("/pipeline") ? (body as (string | number)[][]).map((c) => ({ result: run(c) })) : { result: run(body as (string | number)[]) };
    return new Response(JSON.stringify(result), { status: 200 });
  });
}

describe("state kept in Redis (Upstash)", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://kv.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    vi.stubGlobal("fetch", fakeUpstash());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is used only when it is configured", () => {
    expect(kvConfigured()).toBe(true);
    vi.unstubAllEnvs();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("KV_REST_API_URL", "");
    expect(kvConfigured()).toBe(false);
  });

  it("queues test alerts for an overlay, in order, and never replays old ones", async () => {
    const q = new RedisTestQueue(60_000, 2);
    expect(await q.cursor()).toBe(0);
    const a = await q.push("k1", "tip", 1_000);
    await q.push("k1", "party", 1_100);
    expect(await q.push("k1", "quest", 1_200)).toBeNull(); // two waiting already
    expect((await q.since("k1", 0, 1_300)).map((e) => e.kind)).toEqual(["tip", "party"]);
    expect((await q.since("k1", a!.seq, 1_300)).map((e) => e.kind)).toEqual(["party"]);
    expect(await q.since("k1", 0, 100_000)).toEqual([]); // expired
    expect(await q.cursor()).toBe(2);
  });

  it("keeps names unique across instances and refuses an older change", async () => {
    const alice = "0x00000000000000000000000000000000000000a1";
    const bob = "0x00000000000000000000000000000000000000b2";
    const p = (address: string, name: string, userId: string, updatedAt: number): Profile => ({ address, name, userId, updatedAt });
    const one = new RedisProfileStore();
    const two = new RedisProfileStore(); // another serverless instance, same Redis
    expect(await one.claim(p(alice, "Ada", "u1", 10))).toEqual({ ok: true });
    expect(await two.claim(p(bob, "ada", "u2", 11))).toEqual({ ok: false, reason: "taken" });
    expect(await two.claim(p(alice, "Ada Two", "u1", 9))).toEqual({ ok: false, reason: "stale" });
    expect(await two.claim(p(alice, "Ada Two", "u1", 12))).toEqual({ ok: true });
    expect((await one.book()).nameOf(alice)).toBe("Ada Two");
    expect((await one.byUser("u1"))?.name).toBe("Ada Two");
    // the old name is free again
    expect(await one.claim(p(bob, "Ada", "u2", 13))).toEqual({ ok: true });
  });
});
