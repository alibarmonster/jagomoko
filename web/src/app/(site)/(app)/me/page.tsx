import type { Metadata } from "next";
import { getWorld } from "@/lib/data";
import { MeView } from "@/components/app/me-view";

export const metadata: Metadata = { title: "My character" };

export default async function MePage() {
  const world = await getWorld();
  const c = world.creator;
  return (
    <div>
      <h1 className="mb-6 text-2xl text-ink">My character</h1>
      <MeView
        quests={world.quests}
        battles={world.battles}
        split={{ creatorBps: c.creatorBps, treasuryBps: c.treasuryBps, communityBps: c.communityBps }}
        creatorName={c.handle}
      />
    </div>
  );
}
