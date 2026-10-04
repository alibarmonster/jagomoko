import type { Metadata } from "next";
import { SAMPLE_DATA } from "@/lib/config";
import { getJury } from "@/lib/data";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { JuryView } from "@/components/app/jury-view";

export const metadata: Metadata = { title: "Jury" };

export default async function JuryPage() {
  const jury = await getJury();
  return (
    <>
      {SAMPLE_DATA ? null : <AutoRefresh />}
      <JuryView cases={jury.cases} poolSize={jury.poolSize} />
    </>
  );
}
