import type { Metadata } from "next";
import { SAMPLE_DATA, SAMPLE_HANDLE } from "@/lib/config";
import { getWorld } from "@/lib/data";
import { LiveStudio } from "@/components/studio/live-studio";
import { StudioQuests } from "@/components/studio/studio-quests";

export const metadata: Metadata = { title: "Quests" };

export default async function StudioQuestsPage() {
  if (!SAMPLE_DATA) return <LiveStudio view="quests" />;
  const world = (await getWorld(SAMPLE_HANDLE))!;
  return <StudioQuests quests={world.quests} />;
}
