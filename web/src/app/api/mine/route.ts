import { handleMine } from "@/lib/server/data-routes";
import { dataLimiter } from "@/lib/server/runtime";

// What one account has done (backings, picks, votes, claims, XP). See lib/server/data-routes.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleMine(request, dataLimiter());
}
