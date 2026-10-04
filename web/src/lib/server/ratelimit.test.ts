import { describe, expect, it } from "vitest";
import { RateLimiter } from "./ratelimit";

describe("RateLimiter", () => {
  it("allows the budget, then refuses until the window resets", () => {
    let now = 1_000;
    const limiter = new RateLimiter(3, 60_000, () => now);
    expect([1, 2, 3].map(() => limiter.take("a").ok)).toEqual([true, true, true]);

    const blocked = limiter.take("a");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);

    now += 30_000;
    expect(limiter.take("a")).toEqual({ ok: false, retryAfterSeconds: 30 });

    now += 30_000;
    expect(limiter.take("a").ok).toBe(true);
  });

  it("counts every key on its own", () => {
    const limiter = new RateLimiter(1, 60_000, () => 0);
    expect(limiter.take("alice").ok).toBe(true);
    expect(limiter.take("alice").ok).toBe(false);
    expect(limiter.take("bob").ok).toBe(true);
  });

  it("does not grow without bound under a flood of distinct keys", () => {
    const limiter = new RateLimiter(1, 60_000, () => 0, 100);
    for (let i = 0; i < 1_000; i++) limiter.take(`k${i}`);
    expect((limiter as unknown as { hits: Map<string, unknown> }).hits.size).toBeLessThanOrEqual(100);
  });

  it("forgets expired keys instead of keeping them forever", () => {
    let now = 0;
    const limiter = new RateLimiter(1, 1_000, () => now, 10);
    for (let i = 0; i < 10; i++) limiter.take(`k${i}`);
    now = 5_000;
    limiter.take("fresh");
    expect((limiter as unknown as { hits: Map<string, unknown> }).hits.size).toBe(1);
  });
});
