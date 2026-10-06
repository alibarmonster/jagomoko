import { getAddress, isAddress } from "viem";
import { SAMPLE_DATA } from "../config";
import { getClips, getWorld } from "../data";
import { EMPTY_MINE } from "../data/mine";
import { fetchMine, fetchStatus, indexerConfigured } from "../data/indexer";
import { indexerLag, type BlockStamp } from "../data/status";
import { toWire } from "../data/wire";
import { clientKey } from "./jsonrpc";
import type { RateLimiter } from "./ratelimit";

/**
 * Read-only live-data routes for the browser (/api/realm, /api/mine, /api/indexer/status). They hold
 * the logic so the route files stay one-liners and this can be tested without a server. None of them
 * can change anything; they only translate the indexer's record into JSON the screens can read.
 */

const json = (body: string, status = 200, headers: HeadersInit = {}) =>
  new Response(body, { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const problem = (status: number, message: string, headers?: HeadersInit) => json(JSON.stringify({ error: message }), status, headers);

function limited(request: Request, limiter: RateLimiter): Response | null {
  const hit = limiter.take(clientKey(request));
  return hit.ok ? null : problem(429, "Slow down a little.", { "retry-after": String(hit.retryAfterSeconds) });
}

const HANDLE = /^[A-Za-z0-9_]{2,32}$/;

/** GET /api/realm?handle=karambol */
export async function handleRealm(request: Request, limiter: RateLimiter): Promise<Response> {
  const slow = limited(request, limiter);
  if (slow) return slow;
  const handle = new URL(request.url).searchParams.get("handle") ?? "";
  if (!HANDLE.test(handle)) return problem(400, "That is not a guild handle.");
  try {
    const world = await getWorld(handle);
    return world ? json(toWire(world)) : problem(404, "There is no such guild.");
  } catch {
    return problem(503, "The live data is not reachable right now.");
  }
}

/** GET /api/clips?handle=karambol : a guild's clip bounties, their clips and the community payouts. */
export async function handleClips(request: Request, limiter: RateLimiter): Promise<Response> {
  const slow = limited(request, limiter);
  if (slow) return slow;
  const handle = new URL(request.url).searchParams.get("handle") ?? "";
  if (!HANDLE.test(handle)) return problem(400, "That is not a guild handle.");
  try {
    const clips = await getClips(handle);
    return clips ? json(toWire(clips)) : problem(404, "There is no such guild.");
  } catch {
    return problem(503, "The live data is not reachable right now.");
  }
}

/** GET /api/mine?address=0x... : everything one account has done, as the indexer sees it. */
export async function handleMine(request: Request, limiter: RateLimiter): Promise<Response> {
  const slow = limited(request, limiter);
  if (slow) return slow;
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!isAddress(address, { strict: false })) return problem(400, "That is not an account address.");
  if (SAMPLE_DATA || !indexerConfigured()) return json(toWire(EMPTY_MINE)); // nothing indexed to read
  try {
    return json(toWire(await fetchMine(getAddress(address))));
  } catch {
    return problem(503, "The live data is not reachable right now.");
  }
}

/** Reads a block's number and time ("latest" for the chain's newest), or null when the chain can't be read. */
export type BlockReader = (block: "latest" | number) => Promise<BlockStamp | null>;

/**
 * GET /api/indexer/status : how far the indexer has read and how far behind the chain that is, so a
 * screen can wait for its own move to appear, and say so when the live numbers are paused.
 */
export async function handleStatus(request: Request, limiter: RateLimiter, readBlock: BlockReader): Promise<Response> {
  const slow = limited(request, limiter);
  if (slow) return slow;
  if (!indexerConfigured()) return problem(503, "The live data is not set up.");
  let processedBlock: number;
  try {
    processedBlock = (await fetchStatus()).processedBlock;
  } catch {
    return problem(503, "The live data is not reachable right now.");
  }
  const safely = (block: "latest" | number) => readBlock(block).catch(() => null);
  const [head, processed] = await Promise.all([safely("latest"), processedBlock > 0 ? safely(processedBlock) : null]);
  return json(JSON.stringify(indexerLag(processedBlock, processed?.timestamp ?? null, head)));
}
