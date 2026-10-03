import type { Metadata } from "next";
import { getWorld } from "@/lib/data";
import { SAMPLE_CREATORS } from "@/lib/data/sample";
import { BoardView } from "@/components/app/board-view";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function BoardPage() {
  const world = await getWorld();
  return (
    <BoardView
      players={world.players}
      creators={SAMPLE_CREATORS.map((c) => ({ handle: c.handle, received: c.received, quests: c.quests, supporters: c.supporters }))}
    />
  );
}
