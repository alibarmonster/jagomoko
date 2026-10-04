/**
 * Fixed-window rate limiter, in memory.
 *
 * Good enough for one server (dev, a single instance, the hackathon demo). Behind several instances
 * each one counts on its own, so move this to a shared store (Redis/Upstash) before real money.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  /** Counts one hit for `key`. `ok` is false once the window's budget is spent. */
  take(key: string): { ok: boolean; retryAfterSeconds: number } {
    const t = this.now();
    if (this.hits.size >= this.maxKeys) this.purge(t);

    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + this.windowMs };
      this.hits.set(key, entry);
    }
    if (entry.count >= this.limit) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) };
    entry.count++;
    return { ok: true, retryAfterSeconds: 0 };
  }

  private purge(t: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= t) this.hits.delete(key);
    // still full of live entries (a flood of distinct keys): drop the oldest rather than grow without bound
    if (this.hits.size >= this.maxKeys) {
      const drop = this.hits.size - this.maxKeys + 1;
      let i = 0;
      for (const key of this.hits.keys()) {
        if (i++ >= drop) break;
        this.hits.delete(key);
      }
    }
  }
}
