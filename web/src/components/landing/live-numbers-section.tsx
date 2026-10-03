import * as React from "react";
import { marketingWorld } from "@/lib/data/marketing";
import { Section } from "./section";
import { StatRows, type Stat } from "./live-numbers";

export function LiveNumbersSection() {
  const p = marketingWorld.protocol;
  // INTEGRATION SEAM: these come from the indexer's Protocol entity (null -> em dash).
  const stats: Stat[] = [
    { label: "Dollars routed through the vault", value: p.totalVolume, kind: "usd" },
    { label: "Sent to community treasuries", value: p.totalTreasury, kind: "usd" },
    { label: "Characters created", value: BigInt(p.players), kind: "count" },
    { label: "Quests completed", value: BigInt(p.questsCompleted), kind: "count" },
  ];
  return (
    <Section
      id="numbers"
      eyebrow="Live from the realm"
      title="The numbers, as they happen"
      aside="Every figure here is read straight from the public record. If we can't reach it, you'll see a dash, never a made-up number."
    >
      <div data-rise>
        <StatRows stats={stats} />
      </div>
    </Section>
  );
}
