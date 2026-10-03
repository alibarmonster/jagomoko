import { getWorld } from "@/lib/data";
import { StudioOverview } from "@/components/studio/studio-overview";

export default async function StudioHomePage() {
  const world = await getWorld();
  return <StudioOverview creator={world.creator} quests={world.quests} battles={world.battles} activity={world.activity} />;
}
