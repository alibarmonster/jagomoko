import type { Metadata } from "next";
import { SAMPLE_DATA } from "@/lib/config";
import { getBoard } from "@/lib/data";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { BoardView } from "@/components/app/board-view";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function BoardPage() {
  const board = await getBoard();
  return (
    <>
      {SAMPLE_DATA ? null : <AutoRefresh />}
      <BoardView players={board.players} creators={board.creators} />
    </>
  );
}
