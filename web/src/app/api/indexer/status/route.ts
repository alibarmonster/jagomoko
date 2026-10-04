import { handleStatus } from "@/lib/server/data-routes";
import { blockReader, dataLimiter } from "@/lib/server/runtime";

// How far the indexer has read, and how far behind the chain that is. See lib/server/data-routes.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleStatus(request, dataLimiter(), blockReader());
}
