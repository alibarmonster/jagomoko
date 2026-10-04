import { handleRpcRequest } from "@/lib/server/rpc-proxy";
import { rpcDeps } from "@/lib/server/runtime";

// Read-only chain access for the browser. See lib/server/rpc-proxy.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleRpcRequest(request, rpcDeps());
}
