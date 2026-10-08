import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWorld } from "@/lib/data";
import { TipPage } from "@/components/app/tip-page";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `Tip ${handle}` };
}

/**
 * Where the QR on stream leads: tip a creator from a phone or a laptop. Web2 tips with an email
 * (practice gold on Monad); web3 tips with ETH from another chain (contract v2). See TipPage.
 */
export default async function TipRoute({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ pay?: string }>;
}) {
  const { handle } = await params;
  const { pay } = await searchParams;
  const world = await getWorld(handle);
  if (!world) notFound();
  const { creator } = world;

  return (
    <div className="mx-auto max-w-md">
      <TipPage
        creatorId={creator.id}
        creatorName={creator.handle}
        split={{ creatorBps: creator.creatorBps, treasuryBps: creator.treasuryBps, communityBps: creator.communityBps }}
        withEth={pay === "eth"}
      />
    </div>
  );
}
