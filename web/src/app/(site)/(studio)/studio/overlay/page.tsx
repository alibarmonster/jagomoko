import type { Metadata } from "next";
import { SAMPLE_DATA, SAMPLE_HANDLE } from "@/lib/config";
import { getWorld } from "@/lib/data";
import { LiveStudio } from "@/components/studio/live-studio";
import { StudioOverlay } from "@/components/studio/studio-overlay";

export const metadata: Metadata = { title: "Overlay" };

export default async function StudioOverlayPage() {
  if (!SAMPLE_DATA) return <LiveStudio view="overlay" />;
  const world = (await getWorld(SAMPLE_HANDLE))!;
  const quest = world.quests.find((q) => q.status === "Open") ?? null;
  const battle = world.battles.find((b) => b.status === "Open" && !b.pointsMode) ?? null;
  return <StudioOverlay quest={quest} battle={battle} />;
}
