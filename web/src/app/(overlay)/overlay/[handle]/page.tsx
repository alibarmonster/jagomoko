import { notFound } from "next/navigation";
import { SAMPLE_DATA } from "@/lib/config";
import { getWorld } from "@/lib/data";
import { isOverlayKey } from "@/lib/overlay-key";
import { LiveOverlay } from "@/components/overlay/live-overlay";
import { OverlayStage, type OverlayAnchor } from "@/components/overlay/overlay-stage";

export const dynamic = "force-dynamic";

const ANCHORS: OverlayAnchor[] = ["bottom-left", "bottom-right", "top-right"];

/**
 * OBS browser source. Add it at 1920×1080. Query options:
 *   ?anchor=bottom-left | bottom-right | top-right
 *   ?motion=off   (still panels, no slide-ins)
 *   ?key=...      (private key from the studio: lets "Send a test" show an alert here)
 */
export default async function OverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ anchor?: string; key?: string }>;
}) {
  const { handle } = await params;
  const { anchor: rawAnchor, key } = await searchParams;
  const world = await getWorld(handle);
  if (!world) notFound();

  const anchor = ANCHORS.find((a) => a === rawAnchor) ?? "bottom-left";
  if (!SAMPLE_DATA) {
    return (
      <main className="relative h-[1080px] w-[1920px]">
        <LiveOverlay handle={world.creator.handleKey} anchor={anchor} testKey={isOverlayKey(key) ? key : undefined} />
      </main>
    );
  }
  const quest = world.quests.find((q) => q.status === "Open") ?? null;
  const battle = world.battles.find((b) => b.status === "Open" && !b.pointsMode) ?? null;

  return (
    <main className="relative h-[1080px] w-[1920px]">
      <OverlayStage quest={quest} battle={battle} anchor={anchor} demo />
    </main>
  );
}
