import type { Metadata } from "next";
import { SAMPLE_DATA, SAMPLE_HANDLE } from "@/lib/config";
import { getWorld } from "@/lib/data";
import { LiveStudio } from "@/components/studio/live-studio";
import { StudioBattles } from "@/components/studio/studio-battles";

export const metadata: Metadata = { title: "Battles" };

export default async function StudioBattlesPage() {
  if (!SAMPLE_DATA) return <LiveStudio view="battles" />;
  const world = (await getWorld(SAMPLE_HANDLE))!;
  return <StudioBattles battles={world.battles} />;
}
