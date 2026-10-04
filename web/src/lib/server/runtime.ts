import { PrivyClient } from "@privy-io/node";
import type { Policy } from "../aa/policy";
import type { BlockStamp } from "../data/status";
import {
  CHAIN_ID,
  CONTRACTS,
  DEPLOYED,
  ENTRY_POINT_V07,
  KERNEL_FACTORY,
  KERNEL_META_FACTORY,
  PUBLIC_RPC_URL,
  sponsoredTargets,
} from "../chain/config";
import type { AaDeps } from "./aa-proxy";
import type { RpcRequest } from "./jsonrpc";
import type { RpcDeps } from "./rpc-proxy";
import { RateLimiter } from "./ratelimit";

/**
 * Server-only wiring for the /api routes: environment, the Privy verifier and the upstream calls.
 * Secrets (PIMLICO_API_KEY, PRIVY_APP_SECRET, MONAD_RPC_URL) are read here and nowhere else, and
 * never leave the server.
 */

type Limiters = { aaRequests: RateLimiter; aaSponsored: RateLimiter; rpc: RateLimiter; data?: RateLimiter };
// kept on globalThis so a dev-server hot reload does not reset everyone's budget
const g = globalThis as typeof globalThis & { __jagomokoLimiters?: Limiters };
function limiters(): Limiters {
  g.__jagomokoLimiters ??= {
    aaRequests: new RateLimiter(300, 60_000), // any bundler/paymaster call, per viewer per minute
    aaSponsored: new RateLimiter(40, 60 * 60_000), // operations the paymaster pays for, per viewer per hour
    rpc: new RateLimiter(600, 60_000), // public reads, per visitor per minute
  };
  return g.__jagomokoLimiters;
}

export const POLICY: Policy = {
  entryPoint: ENTRY_POINT_V07,
  chainId: CHAIN_ID,
  factories: [KERNEL_META_FACTORY, KERNEL_FACTORY],
  targets: sponsoredTargets(CONTRACTS),
  maxCalls: 6,
  maxCallDataBytes: 16_384,
};

async function post(url: string, rpc: RpcRequest, timeoutMs = 20_000) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(rpc),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  return { status: res.status, body: await res.text() };
}

let privy: PrivyClient | undefined;
async function verifyPrivyToken(token: string): Promise<{ userId: string }> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Privy is not configured");
  privy ??= new PrivyClient({ appId, appSecret });
  const claims = await privy.utils().auth().verifyAccessToken(token);
  return { userId: claims.user_id };
}

export type Wiring<T> = { ok: true; value: T } | { ok: false; message: string };

/** Dependencies for /api/aa, or the reason it cannot run yet. */
export function aaDeps(): Wiring<AaDeps> {
  const url = process.env.PIMLICO_RPC_URL || (process.env.PIMLICO_API_KEY ? `https://api.pimlico.io/v2/${CHAIN_ID}/rpc?apikey=${process.env.PIMLICO_API_KEY}` : "");
  if (!url) return { ok: false, message: "Sponsored transactions are not set up yet." };
  if (!DEPLOYED) return { ok: false, message: "The contracts are not deployed yet." };
  const l = limiters();
  return {
    ok: true,
    value: {
      verifyToken: verifyPrivyToken,
      forward: (rpc) => post(url, rpc),
      policy: POLICY,
      requests: l.aaRequests,
      sponsored: l.aaSponsored,
      sponsorshipPolicyId: process.env.PIMLICO_SPONSORSHIP_POLICY_ID || undefined,
    },
  };
}

/** Dependencies for /api/rpc. Falls back to the public RPC when no private endpoint is configured. */
export function rpcDeps(): RpcDeps {
  const url = process.env.MONAD_RPC_URL || PUBLIC_RPC_URL;
  return { forward: (rpc) => post(url, rpc), limiter: limiters().rpc };
}

// The newest block is shared for 2 s (screens poll the status often); an old block's time never changes.
const head: { at: number; value: BlockStamp | null } = { at: 0, value: null };
const stamps = new Map<number, BlockStamp>();

/** A block's number and time ("latest" for the newest), or null when the chain can't be read. Never throws. */
async function readBlock(block: "latest" | number): Promise<BlockStamp | null> {
  if (block === "latest" && head.value && Date.now() - head.at < 2_000) return head.value;
  if (block !== "latest" && stamps.has(block)) return stamps.get(block)!;
  try {
    const tag = block === "latest" ? "latest" : `0x${block.toString(16)}`;
    const res = await post(process.env.MONAD_RPC_URL || PUBLIC_RPC_URL, { jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: [tag, false] }, 5_000);
    if (res.status !== 200) return null;
    const found = (JSON.parse(res.body) as { result?: { number?: string; timestamp?: string } | null }).result;
    if (!found?.number || !found.timestamp) return null;
    const stamp = { number: Number(BigInt(found.number)), timestamp: Number(BigInt(found.timestamp)) };
    if (block === "latest") Object.assign(head, { at: Date.now(), value: stamp });
    else {
      if (stamps.size > 64) stamps.clear();
      stamps.set(block, stamp);
    }
    return stamp;
  } catch {
    return null;
  }
}

/** Block reads for /api/indexer/status, to tell how far behind the chain the live record is. */
export function blockReader(): (block: "latest" | number) => Promise<BlockStamp | null> {
  return readBlock;
}

/** Per-visitor limiter for the live-data routes. */
export function dataLimiter(): RateLimiter {
  // created on first use (not with the others) so a dev server that hot-reloads keeps working
  const l = limiters();
  l.data ??= new RateLimiter(300, 60_000); // live-data reads (realms, history), per visitor per minute
  return l.data;
}
