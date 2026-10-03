import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findCreatorByHandle, getWorld } from "@/lib/data";
import { TreasuryView } from "@/components/app/treasury-view";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `${handle}’s treasury` };
}

export default async function TreasuryPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const world = await getWorld();
  const creator = findCreatorByHandle(world, handle);
  if (!creator) notFound();
  return <TreasuryView creator={creator} proposals={world.proposals} players={world.players} />;
}
