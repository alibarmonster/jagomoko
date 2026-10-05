import { isOverlayKey } from "../overlay-key";
import { isTestKind } from "../overlay-test";
import { clientKey } from "./jsonrpc";
import type { OverlayTestQueue } from "./overlay-tests";
import type { RateLimiter } from "./ratelimit";

/**
 * /api/overlay/test: the studio's "send a test alert" button and the overlay that shows it. The
 * logic lives here so the route files stay one-liners and this can be tested without a server.
 * Nothing here touches the chain or any money. A request picks one of a few fixed alerts for the
 * overlay that holds the same private key; it can never choose the text.
 */

export interface OverlayDeps {
  queue: OverlayTestQueue;
  /** every call, per visitor */
  byClient: RateLimiter;
  /** test alerts sent, per overlay key */
  byKey: RateLimiter;
  now?: () => number;
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const problem = (status: number, message: string, headers?: HeadersInit) => json({ error: message }, status, headers);

function limited(limiter: RateLimiter, key: string): Response | null {
  const hit = limiter.take(key);
  return hit.ok ? null : problem(429, "Slow down a little.", { "retry-after": String(hit.retryAfterSeconds) });
}

const MAX_BODY = 512;

/** POST /api/overlay/test  { key, kind } */
export async function handleTestSend(request: Request, deps: OverlayDeps): Promise<Response> {
  const slow = limited(deps.byClient, clientKey(request));
  if (slow) return slow;

  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY) return problem(413, "That request is too large.");
  let body: { key?: unknown; kind?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return problem(400, "Send a key and a kind.");
  }
  if (!body || typeof body !== "object" || !isOverlayKey(body.key)) return problem(400, "That is not an overlay key.");
  if (!isTestKind(body.kind)) return problem(400, "That is not a test alert.");

  const tooMany = limited(deps.byKey, body.key);
  if (tooMany) return tooMany;
  const event = deps.queue.push(body.key, body.kind, (deps.now ?? Date.now)());
  if (!event) return problem(429, "Your overlay still has alerts waiting. Give it a few seconds.", { "retry-after": "5" });
  return json({ ok: true, seq: event.seq });
}

/**
 * GET /api/overlay/test?key=...&after=12  : what the overlay has not shown yet.
 * Without `after` (the overlay just opened) it only returns the cursor, so old tests are never replayed.
 */
export async function handleTestRead(request: Request, deps: OverlayDeps): Promise<Response> {
  const slow = limited(deps.byClient, clientKey(request));
  if (slow) return slow;

  const params = new URL(request.url).searchParams;
  const key = params.get("key");
  if (!isOverlayKey(key)) return problem(400, "That is not an overlay key.");

  const rawAfter = params.get("after");
  if (rawAfter === null) return json({ cursor: deps.queue.cursor(), events: [] });
  const after = Number(rawAfter);
  if (!Number.isSafeInteger(after) || after < 0) return problem(400, "That is not a position.");

  const events = deps.queue.since(key, after, (deps.now ?? Date.now)());
  return json({ cursor: deps.queue.cursor(), events: events.map((e) => ({ seq: e.seq, kind: e.kind })) });
}
