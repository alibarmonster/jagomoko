import type { TestKind } from "../overlay-test";

/**
 * The test alerts waiting for an overlay, per overlay key. In memory: it works while one server
 * process serves both the studio and the overlay (dev, `next start`, a single instance). Behind
 * several instances, or serverless, this needs a shared store (Redis/Upstash).
 */

export interface TestEvent {
  seq: number;
  kind: TestKind;
  at: number;
}

export class OverlayTestQueue {
  private readonly byKey = new Map<string, TestEvent[]>();
  private seq = 0;

  constructor(
    /** how long a test alert waits for the overlay to pick it up */
    private readonly ttlMs = 60_000,
    /** most alerts waiting for one overlay at a time */
    private readonly perKey = 10,
    /** most overlays remembered at once (a flood of made-up keys can't grow memory) */
    private readonly maxKeys = 1_000,
  ) {}

  /** Queues a test alert. Returns null when this overlay already has too many waiting. */
  push(key: string, kind: TestKind, now: number): TestEvent | null {
    const live = (this.byKey.get(key) ?? []).filter((e) => now - e.at < this.ttlMs);
    if (live.length >= this.perKey) {
      this.byKey.set(key, live);
      return null;
    }
    if (!this.byKey.has(key) && this.byKey.size >= this.maxKeys) this.purge(now);
    const event = { seq: ++this.seq, kind, at: now };
    live.push(event);
    this.byKey.set(key, live);
    return event;
  }

  /** The newest sequence number so far: an overlay that just opened starts from here, so it never replays old tests. */
  cursor(): number {
    return this.seq;
  }

  /** What this overlay has not seen yet (sequence number after `after`), oldest first. */
  since(key: string, after: number, now: number): TestEvent[] {
    return (this.byKey.get(key) ?? []).filter((e) => e.seq > after && now - e.at < this.ttlMs);
  }

  private purge(now: number) {
    for (const [key, events] of this.byKey) {
      const live = events.filter((e) => now - e.at < this.ttlMs);
      if (live.length === 0) this.byKey.delete(key);
      else this.byKey.set(key, live);
    }
    // still full of live keys: drop the oldest ones rather than grow without bound
    if (this.byKey.size >= this.maxKeys) {
      const drop = this.byKey.size - this.maxKeys + 1;
      let i = 0;
      for (const key of this.byKey.keys()) {
        if (i++ >= drop) break;
        this.byKey.delete(key);
      }
    }
  }
}
