/** Small JSON-RPC 2.0 helpers shared by the /api/aa and /api/rpc proxies. */

export type RpcId = string | number | null;

export interface RpcRequest {
  jsonrpc: "2.0";
  id: RpcId;
  method: string;
  params?: unknown[];
}

/** Largest request body the proxies read. A user operation is a few KB. */
export const MAX_BODY_BYTES = 64 * 1024;

export function rpcError(id: RpcId, code: number, message: string, status: number, headers?: HeadersInit): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

/** Reads the body with a size cap. Returns null when it is too large. */
export async function readBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  const text = await request.text();
  return new TextEncoder().encode(text).length > maxBytes ? null : text;
}

/** Parses one JSON-RPC request object. Batches (arrays) and anything malformed give an error response. */
export function parseRpcRequest(text: string): { ok: true; request: RpcRequest } | { ok: false; response: Response } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, response: rpcError(null, -32700, "Parse error", 400) };
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, response: rpcError(null, -32600, "Send one request at a time", 400) };
  }
  const { jsonrpc, id, method, params } = json as Record<string, unknown>;
  const safeId: RpcId = typeof id === "string" || typeof id === "number" ? id : null;
  if (jsonrpc !== "2.0" || typeof method !== "string") return { ok: false, response: rpcError(safeId, -32600, "Invalid request", 400) };
  if (params !== undefined && !Array.isArray(params)) return { ok: false, response: rpcError(safeId, -32602, "Params must be an array", 400) };
  return { ok: true, request: { jsonrpc: "2.0", id: safeId, method, params: params as unknown[] | undefined } };
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
  return match?.[1] ?? null;
}

/** First hop of x-forwarded-for (set by the platform proxy), for per-visitor limits on public reads. */
export function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
