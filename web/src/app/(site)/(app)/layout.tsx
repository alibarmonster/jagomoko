import { AppShell } from "@/components/app/app-shell";

// Sample screens compute countdowns relative to the request time.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
