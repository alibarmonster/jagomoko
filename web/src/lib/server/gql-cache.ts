import { createHash } from "node:crypto";
import { kv, kvConfigured } from "./kv";

/**
 * A short cache in front of the indexer's GraphQL. The hosted indexer (Envio Cloud, free plan) takes
 * at most 100 queries a minute for the whole site, while every open page and overlay polls. So each
 * distinct query is asked at most once per `ttlMs`: first from this instance's memory, then from
 * Redis (shared by every serverless instance), and only then from the indexer. When the indexer
 * refuses (429) or is down, the last answer is served for a while instead of an error.
 */

type Entry = { at: number; data: unknown };

/** how long a stale answer may stand in when the indexer can't be read */
const STALE_MS = 15 * 60_000;
const MAX_MEMORY = 500;

const g = globalThis as typeof globalThis & { __jagomokoGql?: { memory: Map<string, Entry>; inflight: Map<string, Promise<unknown>> } };
const state = (g.__jagomokoGql ??= { memory: new Map(), inflight: new Map() });

const redisKey = (key: string) => `jagomoko:gql:${key}`;

async function fromRedis(key: string): Promise<Entry | null> {
  if (!kvConfigured()) return null;
  try {
    const text = await kv<string | null>(["GET", redisKey(key)]);
    return text ? (JSON.parse(text) as Entry) : null;
  } catch {
    return null; // Redis trouble never takes the page down: ask the indexer instead
  }
}

function remember(key: string, entry: Entry) {
  if (state.memory.size >= MAX_MEMORY) state.memory.clear();
  state.memory.set(key, entry);
  if (kvConfigured()) void kv(["SET", redisKey(key), JSON.stringify(entry), "PX", STALE_MS]).catch(() => undefined);
}

/** `load()`'s answer for this query, at most `ttlMs` old, or a stale one when `load()` fails. */
export async function cachedQuery<T>(query: string, variables: Record<string, unknown>, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const key = createHash("sha1").update(query).update("\u0000").update(JSON.stringify(variables)).digest("hex");
  const now = Date.now();
  const mine = state.memory.get(key);
  if (mine && now - mine.at < ttlMs) return mine.data as T;

  const pending = state.inflight.get(key);
  if (pending) return pending as Promise<T>;

  const run = (async () => {
    const shared = await fromRedis(key);
    if (shared && Date.now() - shared.at < ttlMs) {
      state.memory.set(key, shared);
      return shared.data as T;
    }
    try {
      const data = await load();
      remember(key, { at: Date.now(), data });
      return data;
    } catch (error) {
      const stale = [mine, shared].filter((e): e is Entry => !!e && Date.now() - e.at < STALE_MS).sort((a, b) => b.at - a.at)[0];
      if (stale) return stale.data as T;
      throw error;
    }
  })();
  state.inflight.set(key, run);
  try {
    return await run;
  } finally {
    state.inflight.delete(key);
  }
}

/** For tests: forget everything this instance remembers. */
export function clearQueryCache() {
  state.memory.clear();
  state.inflight.clear();
}
