import type { Metadata } from "next";
import { getWorld } from "@/lib/data";
import { StudioOverlay } from "@/components/studio/studio-overlay";

export const metadata: Metadata = { title: "Overlay" };

export default async function StudioOverlayPage() {
  const world = await getWorld();
  const quest = world.quests.find((q) => q.status === "Open") ?? null;
  const battle = world.battles.find((b) => b.status === "Open" && !b.pointsMode) ?? null;
  return <StudioOverlay quest={quest} battle={battle} />;
}
