import { headers } from "next/headers";
import { notFound } from "next/navigation";
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
 *   ?qr=1         (a QR to the guild's tip page, so viewers can tip from their phones)
 *   ?mode=web3    (name the chain a tip came from, and offer ETH tips on the QR; web2 is the default)
 *   ?sound=off    (tips make no sound; by default a tip plays three seconds of public/sounds/tip-alert.mp3)
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
  searchParams: Promise<{ anchor?: string; key?: string; qr?: string; mode?: string; sound?: string }>;
}) {
  const { handle } = await params;
  const { anchor: rawAnchor, key, qr, mode, sound } = await searchParams;
  // OBS must never be left with an error page: if the live record can't be read right now, the
  // overlay still loads and reads it itself a few seconds later (an unknown guild is still a 404)
  const world = await getWorld(handle).catch(() => undefined);
  if (world === null) notFound();
  const handleKey = world?.creator.handleKey ?? handle.toLowerCase();

  const anchor = ANCHORS.find((a) => a === rawAnchor) ?? "bottom-left";
  const web3 = mode === "web3";
  // a web3 overlay promises ETH, so its QR opens the tip page on the ETH form
  const tipQr = qr === "1" ? `${await siteOrigin()}${routes.tip(handleKey, { eth: web3 })}` : undefined;
  if (!SAMPLE_DATA || !world) {
    return (
      <main className="relative h-[1080px] w-[1920px]">
        <LiveOverlay handle={handleKey} anchor={anchor} testKey={isOverlayKey(key) ? key : undefined} tipQr={tipQr} web3={web3} sound={sound !== "off"} />
      </main>
    );
  }
  const quest = world.quests.find((q) => q.status === "Open") ?? null;
  const battle = world.battles.find((b) => b.status === "Open" && !b.pointsMode) ?? null;

  return (
    <main className="relative h-[1080px] w-[1920px]">
      <OverlayStage quest={quest} battle={battle} anchor={anchor} demo tipQr={tipQr} web3={web3} />
    </main>
  );
}
