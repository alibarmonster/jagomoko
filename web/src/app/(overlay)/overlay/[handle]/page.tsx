import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CROSSCHAIN_LIVE } from "@/lib/chain/config";
import { routes } from "@/lib/routing/routes";
import { SAMPLE_DATA } from "@/lib/config";
import { getWorld } from "@/lib/data";
import { isOverlayKey } from "@/lib/overlay/key";
import { LiveOverlay } from "@/components/overlay/live-overlay";
import { OverlayStage, type OverlayAnchor } from "@/components/overlay/overlay-stage";

export const dynamic = "force-dynamic";

const ANCHORS: OverlayAnchor[] = ["bottom-left", "bottom-right", "top-right"];

/**
 * OBS browser source. Add it at 1920×1080. Query options:
 *   ?anchor=bottom-left | bottom-right | top-right
 *   ?motion=off   (still panels, no slide-ins)
 *   ?key=...      (private key from the studio: lets "Send a test" show an alert here)
 *   ?qr=1         (a QR to the guild's tip page, for tips from other chains)
 */

/** Where viewers' phones should go: the public site (NEXT_PUBLIC_SITE_URL), else this request's origin. */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
export default async function OverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ anchor?: string; key?: string; qr?: string }>;
}) {
  const { handle } = await params;
  const { anchor: rawAnchor, key, qr } = await searchParams;
  const world = await getWorld(handle);
  if (!world) notFound();

  const anchor = ANCHORS.find((a) => a === rawAnchor) ?? "bottom-left";
  const tipQr = qr === "1" && (CROSSCHAIN_LIVE || SAMPLE_DATA) ? `${await siteOrigin()}${routes.tip(world.creator.handleKey)}` : undefined;
  if (!SAMPLE_DATA) {
    return (
      <main className="relative h-[1080px] w-[1920px]">
        <LiveOverlay handle={world.creator.handleKey} anchor={anchor} testKey={isOverlayKey(key) ? key : undefined} tipQr={tipQr} />
      </main>
    );
  }
  const quest = world.quests.find((q) => q.status === "Open") ?? null;
  const battle = world.battles.find((b) => b.status === "Open" && !b.pointsMode) ?? null;

  return (
    <main className="relative h-[1080px] w-[1920px]">
      <OverlayStage quest={quest} battle={battle} anchor={anchor} demo tipQr={tipQr} />
    </main>
  );
}
