import { SAMPLE_DATA, SAMPLE_HANDLE } from "@/lib/config";
import { getWorld } from "@/lib/data";
import { LiveStudio } from "@/components/studio/live-studio";
import { StudioOverview } from "@/components/studio/studio-overview";

export default async function StudioHomePage() {
  if (!SAMPLE_DATA) return <LiveStudio view="overview" />;
  const world = (await getWorld(SAMPLE_HANDLE))!;
  return <StudioOverview creator={world.creator} quests={world.quests} battles={world.battles} activity={world.activity} />;
}
