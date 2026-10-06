"use client";

import * as React from "react";
import { formatInt, formatUsd } from "@/lib/utils/money";
import type { Role } from "@/lib/domain/roles";
import type { Player } from "@/lib/data/types";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/components/session";
import { LeaderboardRow } from "./leaderboard-row";

interface Row {
  key: string;
  name: string;
  seed: string;
  role?: Role;
  level?: number;
  sort: bigint;
  metric: string;
  you?: boolean;
}

const TOP = 10;

function Board({ rows, metricLabel }: { rows: Row[]; metricLabel: string }) {
  const sorted = [...rows].sort((a, b) => (a.sort === b.sort ? 0 : a.sort > b.sort ? -1 : 1));
  const top = sorted.slice(0, TOP);
  const youIndex = sorted.findIndex((r) => r.you);
  const pinned = youIndex >= TOP ? sorted[youIndex] : null;
  return (
    <Card className="px-3 sm:px-5">
      <ul className="divide-y divide-line">
        {top.map((r, i) => (
          <LeaderboardRow key={r.key} rank={i + 1} name={r.name} seed={r.seed} role={r.role} level={r.level} metric={r.metric} metricLabel={metricLabel} you={r.you} />
        ))}
      </ul>
      {pinned ? (
        <ul className="border-t border-line py-2" aria-label="Your position">
          <LeaderboardRow rank={youIndex + 1} name={pinned.name} seed={pinned.seed} role={pinned.role} level={pinned.level} metric={pinned.metric} metricLabel={metricLabel} you />
        </ul>
      ) : null}
    </Card>
  );
}

/** Four boards. The viewer's own row is highlighted, or pinned beneath the top ten when they are further down. */
export function BoardView({
  players,
  creators,
}: {
  players: Player[];
  creators: { handle: string; received: bigint; quests: number; supporters: number }[];
}) {
  const s = useSession();
  const me = s.state.character;
  const backedTotal = Object.values(s.state.backed).reduce((a, b) => a + b, 0n);
  const juryCount = Object.keys(s.state.jury).length;

  const forRole = (role: Role, sort: (p: Player) => bigint, metric: (p: Player) => string, you: () => { sort: bigint; metric: string }): Row[] => {
    const rows: Row[] = players
      .filter((p) => p.role === role)
      .map((p) => ({ key: p.id, name: p.name, seed: p.id, role: p.role, level: p.level, sort: sort(p), metric: metric(p) }));
    if (s.signedIn && me && me.role === role) {
      const y = you();
      rows.push({ key: "you", name: me.name, seed: s.state.email ?? me.name, role: me.role, level: s.level, sort: y.sort, metric: y.metric, you: true });
    }
    return rows;
  };

  const knights = forRole("Knight", (p) => p.totalBacked, (p) => formatUsd(p.totalBacked), () => ({ sort: backedTotal, metric: formatUsd(backedTotal) }));
  const seers = forRole("Seer", (p) => p.totalWon, (p) => formatUsd(p.totalWon), () => ({ sort: 0n, metric: formatUsd(0n) }));
  const judges = forRole("Judge", (p) => BigInt(p.juryVotes), (p) => formatInt(p.juryVotes), () => ({ sort: BigInt(juryCount), metric: formatInt(juryCount) }));
  const creatorRows: Row[] = creators.map((c) => ({ key: c.handle, name: c.handle, seed: c.handle, sort: c.received, metric: formatUsd(c.received) }));

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="text-2xl text-ink">Leaderboard</h1>
        <p className="mt-2 text-base text-muted">The most generous backers, the sharpest callers, the fairest Judges and the creators with the most active communities.</p>
      </header>

      <Tabs defaultValue="knights" className="mt-6">
        <TabsList aria-label="Leaderboards">
          <TabsTrigger value="knights">Knights</TabsTrigger>
          <TabsTrigger value="seers">Seers</TabsTrigger>
          <TabsTrigger value="judges">Judges</TabsTrigger>
          <TabsTrigger value="creators">Creators</TabsTrigger>
        </TabsList>
        <TabsContent value="knights">
          <Board rows={knights} metricLabel="backed" />
        </TabsContent>
        <TabsContent value="seers">
          <Board rows={seers} metricLabel="won" />
        </TabsContent>
        <TabsContent value="judges">
          <Board rows={judges} metricLabel="jury votes" />
        </TabsContent>
        <TabsContent value="creators">
          <Board rows={creatorRows} metricLabel="received" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
