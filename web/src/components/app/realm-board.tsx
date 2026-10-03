"use client";

import * as React from "react";
import type { Battle, Player, Quest } from "@/lib/data/types";
import { useNow } from "@/components/clock";
import { resolveBattles, resolveQuests, useEffectiveSplit, useStudio } from "@/components/studio/studio-store";
import { BattleCard } from "./battle-card";
import { QuestCard } from "./quest-card";
import { SectionHeading } from "./section-heading";
import { TipPanel } from "./tip-panel";

/**
 * The quests and battles of a realm. Reads the indexed lists and layers on
 * whatever the creator just made or reported in the studio, so both sides of
 * the product stay consistent.
 */
export function RealmBoard({
  quests,
  battles,
  players,
  creatorName,
}: {
  quests: Quest[];
  battles: Battle[];
  players: Player[];
  creatorName: string;
}) {
  const studio = useStudio();
  const split = useEffectiveSplit();
  const now = useNow(5_000);

  const allQuests = resolveQuests(quests, studio.state, now);
  const allBattles = resolveBattles(battles, studio.state, now);
  const isLive = (s: Quest["status"]) => s === "Open" || s === "Proposed" || s === "Disputed";
  const activeQuests = allQuests.filter((q) => isLive(q.status));
  const finishedQuests = allQuests.filter((q) => !isLive(q.status));
  const liveBattles = allBattles.filter((b) => isLive(b.status));
  const pastBattles = allBattles.filter((b) => !isLive(b.status));
  const preview = (i: number) => players.slice(i, i + 6).map((p) => ({ name: p.name, role: p.role, seed: p.id }));

  return (
    <>
      <section aria-labelledby="quests-title">
        <SectionHeading id="quests-title" title="Quests" meta={`${activeQuests.length} active`} />
        <div className="grid gap-4 xl:grid-cols-2">
          {activeQuests.map((q, i) => (
            <QuestCard key={q.id} quest={q} split={split} creatorName={creatorName} backers={preview(i * 2)} />
          ))}
        </div>
      </section>

      <section aria-labelledby="battles-title">
        <SectionHeading id="battles-title" title="Battles" meta={`${liveBattles.length} live`} />
        <div className="grid gap-4 xl:grid-cols-2">
          {liveBattles.map((b) => (
            <BattleCard key={b.id} battle={b} />
          ))}
        </div>
      </section>

      {/* on small screens the tip panel sits between live battles and finished items */}
      <div className="lg:hidden">
        <TipPanel creatorName={creatorName} />
      </div>

      <section aria-labelledby="finished-title">
        <SectionHeading id="finished-title" title="Recently finished" />
        <div className="grid gap-4 xl:grid-cols-2">
          {finishedQuests.map((q, i) => (
            <QuestCard key={q.id} quest={q} split={split} creatorName={creatorName} backers={preview(i * 3 + 1)} />
          ))}
          {pastBattles.map((b) => (
            <BattleCard key={b.id} battle={b} />
          ))}
        </div>
      </section>
    </>
  );
}
