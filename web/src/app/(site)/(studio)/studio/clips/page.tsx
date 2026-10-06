import type { Metadata } from "next";
import { SAMPLE_DATA, SAMPLE_HANDLE } from "@/lib/config";
import { getClips } from "@/lib/data";
import { LiveStudioClips, StudioClips } from "@/components/studio/studio-clips";

export const metadata: Metadata = { title: "Clips & bounties" };

export default async function StudioClipsPage() {
  if (!SAMPLE_DATA) return <LiveStudioClips />;
  const clips = (await getClips(SAMPLE_HANDLE))!;
  return <StudioClips data={clips} />;
}
