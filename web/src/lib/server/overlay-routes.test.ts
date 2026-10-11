import { describe, expect, it } from "vitest";
import { newOverlayKey } from "../overlay/key";
import { handleTestRead, handleTestSend, type OverlayDeps } from "./overlay-routes";
import { OverlayTestQueue } from "./overlay-tests";
import { RateLimiter } from "./ratelimit";

let clock = 1_000_000;
const deps = (over: Partial<OverlayDeps> = {}): OverlayDeps => ({
  queue: new OverlayTestQueue(),
  byClient: new RateLimiter(1_000, 60_000),
  byKey: new RateLimiter(1_000, 60_000),
  now: () => clock,
  ...over,
});

const post = (body: unknown, ip = "9.9.9.9") =>
  new Request("http://localhost/api/overlay/test", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const get = (query: string, ip = "9.9.9.9") => new Request(`http://localhost/api/overlay/test?${query}`, { headers: { "x-forwarded-for": ip } });

describe("OverlayTestQueue", () => {
  it("hands each overlay only its own alerts, oldest first, and only the ones it has not seen", () => {
    const q = new OverlayTestQueue();
    q.push("a", "tip", 0);
    q.push("b", "quest", 0);
    q.push("a", "result", 0);
    expect(q.since("a", 0, 1).map((e) => e.kind)).toEqual(["tip", "result"]);
    expect(q.since("b", 0, 1).map((e) => e.kind)).toEqual(["quest"]);
    const seen = q.since("a", 0, 1)[0]!.seq;
    expect(q.since("a", seen, 1).map((e) => e.kind)).toEqual(["result"]);
    expect(q.since("nobody", 0, 1)).toEqual([]);
  });

  it("forgets alerts nobody picked up for a minute", () => {
    const q = new OverlayTestQueue(60_000);
    q.push("a", "tip", 0);
    expect(q.since("a", 0, 59_999)).toHaveLength(1);
    expect(q.since("a", 0, 60_000)).toHaveLength(0);
  });

  it("refuses to pile up more than a few alerts for one overlay", () => {
    const q = new OverlayTestQueue(60_000, 3);
    expect([1, 2, 3, 4].map(() => q.push("a", "tip", 0) !== null)).toEqual([true, true, true, false]);
    expect(q.push("a", "tip", 61_000)).not.toBeNull(); // the old ones expired
  });

  it("cannot be made to grow by a flood of made-up keys", () => {
    const q = new OverlayTestQueue(60_000, 10, 50);
    for (let i = 0; i < 500; i++) q.push(`key-${i}`, "tip", 0);
    const held = Array.from({ length: 500 }, (_, i) => q.since(`key-${i}`, 0, 1).length).filter(Boolean).length;
    expect(held).toBeLessThanOrEqual(50);
  });
});

describe("POST /api/overlay/test", () => {
  it("queues a fixed test alert for the overlay that has the key", async () => {
    const d = deps();
    const key = newOverlayKey();
    const res = await handleTestSend(post({ key, kind: "tip" }), d);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await d.queue.since(key, 0, clock)).map((e) => e.kind)).toEqual(["tip"]);
  });

  it("refuses a bad key, an unknown kind, and anything that is not JSON", async () => {
    const d = deps();
    const key = newOverlayKey();
    expect((await handleTestSend(post({ key: "short", kind: "tip" }), d)).status).toBe(400);
    expect((await handleTestSend(post({ kind: "tip" }), d)).status).toBe(400);
    expect((await handleTestSend(post({ key, kind: "<script>alert(1)</script>" }), d)).status).toBe(400);
    expect((await handleTestSend(post({ key, kind: "tip", text: "free text" }), d)).status).toBe(200); // extra fields are ignored, never shown
    expect((await handleTestSend(post("not json"), d)).status).toBe(400);
    expect((await handleTestSend(post("null"), d)).status).toBe(400);
    expect((await handleTestSend(post({ key, kind: "tip", pad: "x".repeat(1_000) }), d)).status).toBe(413);
  });

  it("limits each overlay key and each visitor, and says when to come back", async () => {
    const key = newOverlayKey();
    const byKey = deps({ byKey: new RateLimiter(2, 60_000) });
    expect((await handleTestSend(post({ key, kind: "tip" }), byKey)).status).toBe(200);
    expect((await handleTestSend(post({ key, kind: "tip" }), byKey)).status).toBe(200);
    const blocked = await handleTestSend(post({ key, kind: "tip" }), byKey);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);

    const byClient = deps({ byClient: new RateLimiter(1, 60_000) });
    expect((await handleTestSend(post({ key, kind: "tip" }, "1.1.1.1"), byClient)).status).toBe(200);
    expect((await handleTestSend(post({ key, kind: "tip" }, "1.1.1.1"), byClient)).status).toBe(429);
    expect((await handleTestSend(post({ key, kind: "tip" }, "2.2.2.2"), byClient)).status).toBe(200);
  });

  it("says so when the overlay already has too many waiting", async () => {
    const d = deps({ queue: new OverlayTestQueue(60_000, 1) });
    const key = newOverlayKey();
    expect((await handleTestSend(post({ key, kind: "tip" }), d)).status).toBe(200);
    expect((await handleTestSend(post({ key, kind: "tip" }), d)).status).toBe(429);
  });
});

describe("GET /api/overlay/test", () => {
  it("gives a freshly opened overlay only a cursor, so it never replays old tests", async () => {
    const d = deps();
    const key = newOverlayKey();
    await handleTestSend(post({ key, kind: "tip" }), d);
    const res = await handleTestRead(get(`key=${key}`), d);
    const body = (await res.json()) as { cursor: number; events: unknown[] };
    expect(res.status).toBe(200);
    expect(body.events).toEqual([]);
    expect(body.cursor).toBeGreaterThan(0);
  });

  it("then returns what is new since the cursor, and nothing twice", async () => {
    const d = deps();
    const key = newOverlayKey();
    const first = (await (await handleTestRead(get(`key=${key}`), d)).json()) as { cursor: number };
    await handleTestSend(post({ key, kind: "quest" }), d);
    await handleTestSend(post({ key, kind: "result" }), d);
    const next = (await (await handleTestRead(get(`key=${key}&after=${first.cursor}`), d)).json()) as { cursor: number; events: { kind: string }[] };
    expect(next.events.map((e) => e.kind)).toEqual(["quest", "result"]);
    const again = (await (await handleTestRead(get(`key=${key}&after=${next.cursor}`), d)).json()) as { events: unknown[] };
    expect(again.events).toEqual([]);
  });

  it("does not show one overlay's alerts to another key", async () => {
    const d = deps();
    const mine = newOverlayKey();
    const theirs = newOverlayKey();
    await handleTestSend(post({ key: mine, kind: "tip" }), d);
    const res = (await (await handleTestRead(get(`key=${theirs}&after=0`), d)).json()) as { events: unknown[] };
    expect(res.events).toEqual([]);
  });

  it("refuses a bad key or a bad position", async () => {
    const d = deps();
    const key = newOverlayKey();
    expect((await handleTestRead(get("key=nope"), d)).status).toBe(400);
    expect((await handleTestRead(get(""), d)).status).toBe(400);
    for (const after of ["-1", "x", "1.5", "99999999999999999999"]) {
      expect((await handleTestRead(get(`key=${key}&after=${after}`), d)).status, after).toBe(400);
    }
  });
});
