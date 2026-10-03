import type { Metadata } from "next";
import { getWorld } from "@/lib/data";
import { StudioQuests } from "@/components/studio/studio-quests";

export const metadata: Metadata = { title: "Quests" };

export default async function StudioQuestsPage() {
  const world = await getWorld();
  return <StudioQuests quests={world.quests} />;
}
