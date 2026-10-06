import { handleClips } from "@/lib/server/data-routes";
import { dataLimiter } from "@/lib/server/runtime";

// A guild's clip bounties, as JSON for the studio. See lib/server/data-routes.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleClips(request, dataLimiter());
}
