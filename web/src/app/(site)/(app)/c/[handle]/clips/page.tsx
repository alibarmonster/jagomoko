import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SAMPLE_DATA } from "@/lib/config";
import { getClips, getWorld } from "@/lib/data";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { ClipsView } from "@/components/app/clips-view";
import { RealmHeader } from "@/components/app/realm-header";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `${handle}’s clip bounties` };
}

export default async function ClipsPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [world, clips] = await Promise.all([getWorld(handle), getClips(handle)]);
  if (!world || !clips) notFound();
  return (
    <div className="space-y-10">
      {SAMPLE_DATA ? null : <AutoRefresh />}
      <RealmHeader creator={world.creator} guild={world.guild} live={SAMPLE_DATA ? true : null} />
      <ClipsView creator={world.creator} data={clips} />
    </div>
  );
}
