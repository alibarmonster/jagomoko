import type { Metadata } from "next";
import { SAMPLE_DATA } from "@/lib/config";
import { getRealms } from "@/lib/data";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { RealmsView } from "@/components/app/realms-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guilds" };

/** Every guild, even when there is only one: this is also where a streamer starts their own. */
export default async function RealmsPage() {
  const realms = await getRealms();
  return (
    <>
      {SAMPLE_DATA ? null : <AutoRefresh />}
      <RealmsView realms={realms} />
    </>
  );
}
