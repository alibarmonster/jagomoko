"use client";

import * as React from "react";
import { fetchRealmClient } from "@/lib/data/client";
import type { World } from "@/lib/data/types";
import { DATA_CHANGED_EVENT } from "@/components/app/auto-refresh";
import { useSession } from "@/components/session";
import { EmptyState, Skeleton } from "@/components/ui/skeleton";
import { RealmContext } from "./studio-core";
import { StudioBattles } from "./studio-battles";
import { StudioOverlay } from "./studio-overlay";
import { StudioOverview } from "./studio-overview";
import { StudioQuests } from "./studio-quests";
import { StudioSettings } from "./studio-settings";

export type StudioView = "overview" | "quests" | "battles" | "overlay" | "settings";

/**
 * One studio screen, fed by the live record of the realm this account owns. It re-reads every few
 * seconds, and straight away after the streamer's own action, so a new backing or a finished
 * result shows up without a reload. (In sample mode the studio pages are rendered on the server
 * from the sample world instead.)
 */
export function LiveStudio({ view }: { view: StudioView }) {
  const session = useSession();
  const handle = session.state.realm?.handle;
  const [world, setWorld] = React.useState<World | null>(null);
  const [unreachable, setUnreachable] = React.useState(false);

  React.useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    const read = async () => {
      const result = await fetchRealmClient(handle);
      if (cancelled) return;
      if ("world" in result) {
        setWorld(result.world);
        setUnreachable(false);
      } else if ("error" in result) {
        setUnreachable(true);
      }
      // notFound: the realm was only just opened and the record has not caught up. Keep trying.
    };
    void read();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, 4_000);
    const onChange = () => void read();
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, onChange);
    };
  }, [handle]);

  if (!world) {
    return unreachable ? (
      <EmptyState title="We can’t reach your guild right now" description="The live data isn’t responding. This page keeps trying, so it will appear as soon as it is back." />
    ) : (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const quest = world.quests.find((q) => q.status === "Open") ?? null;
  const battle = world.battles.find((b) => b.status === "Open" && !b.pointsMode) ?? null;
  return (
    <RealmContext.Provider value={world}>
      {view === "overview" ? <StudioOverview creator={world.creator} quests={world.quests} battles={world.battles} activity={world.activity} /> : null}
      {view === "quests" ? <StudioQuests quests={world.quests} /> : null}
      {view === "battles" ? <StudioBattles battles={world.battles} /> : null}
      {view === "overlay" ? <StudioOverlay quest={quest} battle={battle} /> : null}
      {view === "settings" ? <StudioSettings /> : null}
    </RealmContext.Provider>
  );
}
