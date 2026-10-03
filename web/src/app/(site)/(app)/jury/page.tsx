import type { Metadata } from "next";
import { getWorld } from "@/lib/data";
import { JuryView } from "@/components/app/jury-view";

export const metadata: Metadata = { title: "Jury" };

export default async function JuryPage() {
  const world = await getWorld();
  return <JuryView cases={world.juryCases} poolSize={world.players.filter((p) => p.enlisted).length} />;
}
