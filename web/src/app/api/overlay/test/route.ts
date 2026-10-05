import { handleTestRead, handleTestSend } from "@/lib/server/overlay-routes";
import { overlayDeps } from "@/lib/server/runtime";

// The studio's "send a test alert" button (POST) and the OBS overlay that shows it (GET).
// See lib/server/overlay-routes.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleTestSend(request, overlayDeps());
}

export async function GET(request: Request) {
  return handleTestRead(request, overlayDeps());
}
