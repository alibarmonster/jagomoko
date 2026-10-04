import { PrivyClient } from "@privy-io/node";
import type { Policy } from "../aa/policy";
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

type Limiters = { aaRequests: RateLimiter; aaSponsored: RateLimiter; rpc: RateLimiter };
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

async function post(url: string, rpc: RpcRequest) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(rpc),
    signal: AbortSignal.timeout(20_000),
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
