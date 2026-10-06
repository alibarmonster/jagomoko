import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SAMPLE_DATA } from "@/lib/config";
import { getMembers, getWorld } from "@/lib/data";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { GuildMembers } from "@/components/app/guild-members";
import { RealmHeader } from "@/components/app/realm-header";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `${handle}’s guild members` };
}

export default async function MembersPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [world, guild] = await Promise.all([getWorld(handle), getMembers(handle)]);
  if (!world || !guild) notFound();
  return (
    <div className="space-y-8">
      {SAMPLE_DATA ? null : <AutoRefresh />}
      <RealmHeader creator={world.creator} guild={world.guild} live={SAMPLE_DATA ? true : null} />
      <div className="max-w-3xl">
        <GuildMembers guild={guild} creatorId={world.creator.id} handle={world.creator.handle} />
      </div>
    </div>
  );
}
