import type { Metadata } from "next";
import { SAMPLE_DATA } from "@/lib/config";
import { getMarkets } from "@/lib/data";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { MeView } from "@/components/app/me-view";

export const metadata: Metadata = { title: "My character" };

export default async function MePage() {
  const markets = await getMarkets();
  return (
    <div>
      {SAMPLE_DATA ? null : <AutoRefresh />}
      <h1 className="mb-6 text-2xl text-ink">My character</h1>
      <MeView quests={markets.quests} battles={markets.battles} creators={markets.creators} />
    </div>
  );
}
