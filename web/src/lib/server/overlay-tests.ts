import type { TestKind } from "../overlay/test-alerts";
import { kvPipeline } from "./kv";

/**
 * The test alerts waiting for an overlay, per overlay key. OverlayTestQueue keeps them in memory,
 * which works while one server process serves both the studio and the overlay (dev, `next start`).
 * On a serverless host the button and the overlay reach different instances, so RedisTestQueue keeps
 * them in Upstash instead (chosen in lib/server/runtime.ts).
 */

export interface TestEvent {
  seq: number;
  kind: TestKind;
  at: number;
}

/** What /api/overlay/test needs from a queue, in memory or in Redis. */
export interface TestQueue {
  push(key: string, kind: TestKind, now: number): TestEvent | null | Promise<TestEvent | null>;
  cursor(): number | Promise<number>;
  since(key: string, after: number, now: number): TestEvent[] | Promise<TestEvent[]>;
}

export class OverlayTestQueue implements TestQueue {
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

/** The same queue in Redis: one list per overlay key that expires on its own, and one shared counter. */
export class RedisTestQueue implements TestQueue {
  private readonly seqKey = "jagomoko:overlay:seq";

  constructor(
    private readonly ttlMs = 60_000,
    private readonly perKey = 10,
  ) {}

  private listKey = (key: string) => `jagomoko:overlay:${key}`;

  async push(key: string, kind: TestKind, now: number): Promise<TestEvent | null> {
    if ((await this.since(key, 0, now)).length >= this.perKey) return null;
    const [seq] = (await kvPipeline([["INCR", this.seqKey]])) as [number];
    const event: TestEvent = { seq, kind, at: now };
    await kvPipeline([
      ["RPUSH", this.listKey(key), JSON.stringify(event)],
      ["LTRIM", this.listKey(key), -this.perKey, -1],
      ["PEXPIRE", this.listKey(key), this.ttlMs],
    ]);
    return event;
  }

  async cursor(): Promise<number> {
    const [seq] = (await kvPipeline([["GET", this.seqKey]])) as [string | null];
    return Number(seq ?? 0);
  }

  async since(key: string, after: number, now: number): Promise<TestEvent[]> {
    const [items] = (await kvPipeline([["LRANGE", this.listKey(key), 0, -1]])) as [string[] | null];
    return (items ?? []).map((i) => JSON.parse(i) as TestEvent).filter((e) => e.seq > after && now - e.at < this.ttlMs);
  }
}
