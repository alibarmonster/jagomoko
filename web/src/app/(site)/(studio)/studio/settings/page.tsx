import type { Metadata } from "next";
import { StudioSettings } from "@/components/studio/studio-settings";

export const metadata: Metadata = { title: "Split & team" };

export default function StudioSettingsPage() {
  return <StudioSettings />;
}
