import type { Metadata } from "next";
import { getWorld } from "@/lib/data";
import { StudioBattles } from "@/components/studio/studio-battles";

export const metadata: Metadata = { title: "Battles" };

export default async function StudioBattlesPage() {
  const world = await getWorld();
  return <StudioBattles battles={world.battles} />;
}
