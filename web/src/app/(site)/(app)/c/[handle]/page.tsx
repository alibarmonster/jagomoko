import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SAMPLE_DATA } from "@/lib/config";
import { getWorld } from "@/lib/data";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { ActivityFeed } from "@/components/app/activity-row";
import { RealmBoard } from "@/components/app/realm-board";
import { RealmHeader } from "@/components/app/realm-header";
import { SectionHeading } from "@/components/app/section-heading";
import { TipPanel } from "@/components/app/tip-panel";
import { TreasurySummary } from "@/components/app/treasury-summary";
import { Card } from "@/components/ui/card";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `${handle}’s realm` };
}

export default async function RealmPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const world = await getWorld(handle);
  if (!world) notFound();
  const creator = world.creator;
  // live data carries the realm's own split; the sample world uses the prototype studio's
  const split = SAMPLE_DATA ? undefined : { creatorBps: creator.creatorBps, treasuryBps: creator.treasuryBps, communityBps: creator.communityBps };

  return (
    <div className="space-y-8">
      {SAMPLE_DATA ? null : <AutoRefresh />}
      <RealmHeader creator={creator} live={SAMPLE_DATA ? true : null} />

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-10 lg:col-span-8">
          <RealmBoard
            quests={world.quests}
            battles={world.battles}
            players={world.players}
            creatorId={creator.id}
            creatorName={creator.handle}
            split={split}
          />
        </div>

        <aside className="space-y-5 lg:col-span-4" aria-label="Realm sidebar">
          <div className="hidden lg:block">
            <TipPanel creatorId={creator.id} creatorName={creator.handle} split={split} />
          </div>
          <TreasurySummary creator={creator} proposals={world.proposals} />
          <Card>
            <div className="p-4 md:p-5">
              <SectionHeading title="Live activity" className="mb-1" />
              <ActivityFeed items={world.activity.slice(0, 10)} />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
