import { handleProfileGet, handleProfilePost } from "@/lib/server/profile-routes";
import { profileDeps } from "@/lib/server/runtime";

// A signed-in viewer's character name, kept off chain. See lib/server/profile-routes.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProfileGet(request, profileDeps());
}

export async function POST(request: Request) {
  return handleProfilePost(request, profileDeps());
}
