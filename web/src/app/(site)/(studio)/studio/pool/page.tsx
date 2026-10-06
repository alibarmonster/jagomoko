import type { Metadata } from "next";
import { StudioPool } from "@/components/studio/studio-pool";

export const metadata: Metadata = { title: "Community Pool" };

export default function StudioPoolPage() {
  return <StudioPool />;
}
