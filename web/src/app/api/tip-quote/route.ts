import { chainSenderReader, handleTipQuote } from "@/lib/server/tip-routes";
import { dataLimiter } from "@/lib/server/runtime";

// The ETH price and LayerZero fee for a cross-chain tip, read from the source chain. See lib/server/tip-routes.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleTipQuote(request, dataLimiter(), chainSenderReader);
}
