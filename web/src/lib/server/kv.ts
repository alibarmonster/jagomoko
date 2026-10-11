/**
 * A tiny client for Upstash Redis over its REST API (plain fetch, no package), for state that has to
 * outlive one serverless instance: character names and the overlay's test alerts. Configured by the
 * env vars Upstash (and Vercel's Upstash integration) set: UPSTASH_REDIS_REST_URL / _TOKEN, or
 * KV_REST_API_URL / _TOKEN. Without them the server keeps that state in a file and in memory.
 */

type Command = (string | number)[];

function config(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export const kvConfigured = (): boolean => config() !== null;

/** Runs one Redis command and returns its result. */
export async function kv<T = unknown>(command: Command): Promise<T> {
  const c = config();
  if (!c) throw new Error("Redis is not configured");
  const res = await fetch(c.url, {
    method: "POST",
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { result?: T; error?: string } | null;
  if (!res.ok || !body || body.error) throw new Error(`Redis ${command[0]} failed: ${body?.error ?? res.status}`);
  return body.result as T;
}

/** Runs several commands in one round trip (not atomic); returns each result in order. */
export async function kvPipeline(commands: Command[]): Promise<unknown[]> {
  const c = config();
  if (!c) throw new Error("Redis is not configured");
  const res = await fetch(`${c.url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { result?: unknown; error?: string }[] | null;
  if (!res.ok || !Array.isArray(body)) throw new Error(`Redis pipeline failed: ${res.status}`);
  const failed = body.find((r) => r.error);
  if (failed) throw new Error(`Redis pipeline failed: ${failed.error}`);
  return body.map((r) => r.result);
}
