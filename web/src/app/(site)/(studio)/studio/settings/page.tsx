import type { Metadata } from "next";
import { SAMPLE_DATA } from "@/lib/config";
import { LiveStudio } from "@/components/studio/live-studio";
import { StudioSettings } from "@/components/studio/studio-settings";

export const metadata: Metadata = { title: "Split & team" };

export default function StudioSettingsPage() {
  return SAMPLE_DATA ? <StudioSettings /> : <LiveStudio view="settings" />;
}
