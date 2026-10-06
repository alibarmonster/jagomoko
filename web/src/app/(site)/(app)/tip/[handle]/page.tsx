import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CROSSCHAIN_LIVE } from "@/lib/chain/config";
import { getWorld } from "@/lib/data";
import { routes } from "@/lib/routes";
import { Card } from "@/components/ui/card";
import { Mascot } from "@/components/ui/mascot";
import { CrossChainTip } from "@/components/app/crosschain-tip";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `Tip ${handle} from any chain` };
}

/**
 * Where the QR on stream leads: tip a creator with ETH from another chain (contract v2), from a
 * phone or a laptop, without a jagomoko account.
 */
export default async function TipPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const world = await getWorld(handle);
  if (!world) notFound();
  const { creator } = world;

  return (
    <div className="mx-auto max-w-md">
      <div className="relative pt-12">
        <Mascot name="moko-hello" height={64} eager className="absolute right-6 top-0 z-10" />
        <Card className="p-4 md:p-5">
          {CROSSCHAIN_LIVE ? (
            <CrossChainTip creatorId={creator.id} creatorName={creator.handle} />
          ) : (
            <div>
              <h1 className="text-lg text-ink">Tips from other chains are coming soon</h1>
              <p className="mt-1 text-sm text-muted">For now you can tip {creator.handle} on Monad.</p>
            </div>
          )}
        </Card>
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        Already on Monad?{" "}
        <Link href={routes.realm(creator.handleKey)} className="text-ink underline underline-offset-2">
          Tip from {creator.handle}&rsquo;s guild
        </Link>
      </p>
    </div>
  );
}
