import { notFound } from "next/navigation";
import { SAMPLE_DATA } from "@/lib/config";
import { getWorld } from "@/lib/data";
import { LiveOverlay } from "@/components/overlay/live-overlay";
import { OverlayStage, type OverlayAnchor } from "@/components/overlay/overlay-stage";

export const dynamic = "force-dynamic";

const ANCHORS: OverlayAnchor[] = ["bottom-left", "bottom-right", "top-right"];

/**
 * OBS browser source. Add it at 1920×1080. Query options:
 *   ?anchor=bottom-left | bottom-right | top-right
 *   ?motion=off   (still panels, no slide-ins)
 */
export default async function OverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ anchor?: string }>;
}) {
  const { handle } = await params;
  const { anchor: rawAnchor } = await searchParams;
  const world = await getWorld(handle);
  if (!world) notFound();

  const anchor = ANCHORS.find((a) => a === rawAnchor) ?? "bottom-left";
  if (!SAMPLE_DATA) {
    return (
      <main className="relative h-[1080px] w-[1920px]">
        <LiveOverlay handle={world.creator.handleKey} anchor={anchor} />
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
