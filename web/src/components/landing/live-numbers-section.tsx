import * as React from "react";
import { SAMPLE_DATA } from "@/lib/config";
import { getProtocol } from "@/lib/data";
import { marketingWorld } from "@/lib/data/marketing";
import { Section } from "./section";
import { StatRows, type Stat } from "./live-numbers";

export async function LiveNumbersSection() {
  // sample mode shows the frozen marketing numbers; live mode reads the indexer, and a dash when it cannot
  const p = SAMPLE_DATA ? marketingWorld.protocol : await getProtocol();
  const stats: Stat[] = [
    { label: "Dollars routed through the vault", value: p ? p.totalVolume : null, kind: "usd" },
    { label: "Sent to community treasuries", value: p ? p.totalTreasury : null, kind: "usd" },
    { label: "Characters created", value: p ? BigInt(p.players) : null, kind: "count" },
    { label: "Quests completed", value: p ? BigInt(p.questsCompleted) : null, kind: "count" },
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
