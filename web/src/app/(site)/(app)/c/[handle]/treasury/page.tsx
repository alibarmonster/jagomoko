import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SAMPLE_DATA } from "@/lib/config";
import { getWorld } from "@/lib/data";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { TreasuryView } from "@/components/app/treasury-view";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `${handle}’s treasury` };
}

export default async function TreasuryPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const world = await getWorld(handle);
  if (!world) notFound();
  return (
    <>
      {SAMPLE_DATA ? null : <AutoRefresh />}
      <TreasuryView creator={world.creator} proposals={world.proposals} players={world.players} />
    </>
  );
}
