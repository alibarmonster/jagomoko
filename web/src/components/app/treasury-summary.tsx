import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatUsd } from "@/lib/utils/money";
import { routes } from "@/lib/routing/routes";
import type { Creator, Proposal } from "@/lib/data/types";
import { Card } from "@/components/ui/card";

export function TreasurySummary({ creator, proposals, className }: { creator: Creator; proposals: Proposal[]; className?: string }) {
  const active = proposals.filter((p) => p.status === "Active").length;
  return (
    <Card className={className}>
      <div className="p-4 md:p-5">
        <p className="text-sm text-subtle">Community treasury</p>
        <p className="mt-1 font-mono text-3xl text-ink tnum">{formatUsd(creator.treasuryBalance, { cents: "always" })}</p>
        <p className="mt-2 text-sm text-muted">
          Funds bounties and community payouts. Everyone with XP votes on how it&rsquo;s spent.
        </p>
        <Link
          href={routes.treasury(creator.handleKey)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition hover:decoration-ink"
        >
          {active > 0 ? `${active} proposals open for voting` : "See the treasury"}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}
