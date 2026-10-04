import { checkRequestParams, METHODS, type Policy } from "../aa/policy";
import { bearerToken, parseRpcRequest, readBody, rpcError, type RpcRequest } from "./jsonrpc";
import type { RateLimiter } from "./ratelimit";

export interface AaDeps {
  /** Verifies a Privy access token and returns who it belongs to. Throws if the token is not valid. */
  verifyToken(token: string): Promise<{ userId: string }>;
  /** Sends the validated request to the bundler/paymaster. The Pimlico key is added here, never in the browser. */
  forward(request: RpcRequest): Promise<{ status: number; body: string }>;
  policy: Policy;
  /** every call a signed-in viewer makes */
  requests: RateLimiter;
  /** the calls where the paymaster commits to paying: this is the sponsored budget */
  sponsored: RateLimiter;
  /** a Pimlico sponsorship policy to pin on every sponsorship request, if one is configured */
  sponsorshipPolicyId?: string;
}

const retryAfter = (seconds: number) => ({ "retry-after": String(seconds) });

/**
 * The browser's bundler and paymaster endpoint. In order, it:
 *  1. requires a valid Privy session (no anonymous gas),
 *  2. forwards only an allowlist of methods,
 *  3. rate-limits each viewer,
 *  4. refuses any operation that is not a plain call to a jagomoko contract (see ../aa/policy),
 *  5. pins the sponsorship policy server-side, then
 *  6. forwards a re-serialised copy of the request, never the raw body.
 */
export async function handleAaRequest(request: Request, deps: AaDeps): Promise<Response> {
  const token = bearerToken(request);
  if (!token) return rpcError(null, -32001, "Sign in first", 401);
  let userId: string;
  try {
    ({ userId } = await deps.verifyToken(token));
  } catch {
    return rpcError(null, -32001, "Sign in again", 401);
  }

  const text = await readBody(request);
  if (text === null) return rpcError(null, -32600, "Request too large", 413);
  const parsed = parseRpcRequest(text);
  if (!parsed.ok) return parsed.response;
  const rpc = parsed.request;

  const rule = Object.hasOwn(METHODS, rpc.method) ? METHODS[rpc.method] : undefined;
  if (!rule) return rpcError(rpc.id, -32601, "Method not allowed", 403);

  const limited = deps.requests.take(userId);
  if (!limited.ok) return rpcError(rpc.id, -32005, "Slow down a little", 429, retryAfter(limited.retryAfterSeconds));

  const params = [...(rpc.params ?? [])];
  const verdict = checkRequestParams(rule, params, deps.policy);
  if (!verdict.ok) return rpcError(rpc.id, -32000, `Not covered: ${verdict.reason}`, 403);

  if (rule.sponsors) {
    const budget = deps.sponsored.take(userId);
    if (!budget.ok) return rpcError(rpc.id, -32005, "Sponsored limit reached. Try again later.", 429, retryAfter(budget.retryAfterSeconds));
  }

  if (rule.contextIndex !== undefined && deps.sponsorshipPolicyId) {
    while (params.length < rule.contextIndex) params.push(null);
    const existing = params[rule.contextIndex];
    const context = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
    params[rule.contextIndex] = { ...context, sponsorshipPolicyId: deps.sponsorshipPolicyId };
  }

  try {
    const upstream = await deps.forward({ jsonrpc: "2.0", id: rpc.id, method: rpc.method, params });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return rpcError(rpc.id, -32603, "The network service is unavailable. Try again.", 502);
  }
}
