import { clientKey, parseRpcRequest, readBody, rpcError, type RpcRequest } from "./jsonrpc";
import type { RateLimiter } from "./ratelimit";

/**
 * Read-only chain access for the browser. The private RPC URL (it carries a token) stays on the
 * server, and nothing here can send a transaction: writes go through /api/aa as user operations.
 */
export const READ_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "net_version",
]);

export interface RpcDeps {
  forward(request: RpcRequest): Promise<{ status: number; body: string }>;
  /** per visitor, since reads are public */
  limiter: RateLimiter;
}

export async function handleRpcRequest(request: Request, deps: RpcDeps): Promise<Response> {
  const limited = deps.limiter.take(clientKey(request));
  if (!limited.ok) return rpcError(null, -32005, "Slow down a little", 429, { "retry-after": String(limited.retryAfterSeconds) });

  const text = await readBody(request);
  if (text === null) return rpcError(null, -32600, "Request too large", 413);
  const parsed = parseRpcRequest(text);
  if (!parsed.ok) return parsed.response;
  const rpc = parsed.request;

  if (!READ_METHODS.has(rpc.method)) return rpcError(rpc.id, -32601, "Method not allowed", 403);

  try {
    const upstream = await deps.forward({ jsonrpc: "2.0", id: rpc.id, method: rpc.method, params: rpc.params ?? [] });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return rpcError(rpc.id, -32603, "The network is unavailable. Try again.", 502);
  }
}
