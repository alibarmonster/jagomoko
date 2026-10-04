import { handleAaRequest } from "@/lib/server/aa-proxy";
import { rpcError } from "@/lib/server/jsonrpc";
import { aaDeps } from "@/lib/server/runtime";

// The browser's bundler and paymaster endpoint (sponsored gas). See lib/server/aa-proxy.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const deps = aaDeps();
  if (!deps.ok) return rpcError(null, -32002, deps.message, 503);
  return handleAaRequest(request, deps.value);
}
