import { handleTipStatus } from "@/lib/server/tip-routes";
import { dataLimiter } from "@/lib/server/runtime";

// Whether a cross-chain tip has landed on Monad yet, by its LayerZero guid. See lib/server/tip-routes.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleTipStatus(request, dataLimiter());
}
