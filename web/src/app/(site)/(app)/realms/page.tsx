import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SAMPLE_DATA } from "@/lib/config";
import { getRealms } from "@/lib/data";
import { routes } from "@/lib/routes";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { RealmsView } from "@/components/app/realms-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Realms" };

export default async function RealmsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const realms = await getRealms();
  const { all } = await searchParams;
  // with only one realm there is nothing to choose: go straight in (?all shows the list anyway)
  const only = realms[0];
  if (realms.length === 1 && only && all === undefined) redirect(routes.realm(only.creator.handleKey));
  return (
    <>
      {SAMPLE_DATA ? null : <AutoRefresh />}
      <RealmsView realms={realms} />
    </>
  );
}
