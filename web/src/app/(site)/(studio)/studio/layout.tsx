import type { Metadata } from "next";
import { StudioGate } from "@/components/studio/studio-gate";
import { StudioShell } from "@/components/studio/studio-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Creator studio", template: "%s · Studio · jagomoko" },
  robots: { index: false, follow: false },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioGate>
      <StudioShell>{children}</StudioShell>
    </StudioGate>
  );
}
