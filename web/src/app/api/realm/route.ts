import { handleRealm } from "@/lib/server/data-routes";
import { dataLimiter } from "@/lib/server/runtime";

// One realm, as JSON for the creator studio. See lib/server/data-routes.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleRealm(request, dataLimiter());
}
