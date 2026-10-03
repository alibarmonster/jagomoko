"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radio, Scale, Trophy, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { SAMPLE_DATA } from "@/lib/config";
import { routes } from "@/lib/routes";
import { Wordmark } from "@/components/ui/sigil";
import { AccountChip } from "./account-chip";

const NAV = [
  { href: routes.realm(), label: "Realm", icon: Radio, match: (p: string) => p.startsWith("/c/") },
  { href: routes.jury, label: "Jury", icon: Scale, match: (p: string) => p.startsWith("/jury") },
  { href: routes.board, label: "Board", icon: Trophy, match: (p: string) => p.startsWith("/board") },
  { href: routes.me, label: "Me", icon: User, match: (p: string) => p.startsWith("/me") },
] as const;

/** Small mono chip: every screen that renders sample data says so. */
export function SampleChip({ className }: { className?: string }) {
  if (!SAMPLE_DATA) return null;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border border-line bg-surface px-2 font-mono text-2xs text-subtle",
        className,
      )}
      title="This screen shows sample data until the live indexer is connected."
    >
      Sample data
    </span>
  );
}

/**
 * Viewer app shell, mobile-first: a top bar (logo, account) and a bottom tab bar
 * on phones; the same links move into the top bar from md up.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-canvas pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-md" style={{ height: "var(--header-h)" }}>
        <div className="container-page flex h-full items-center gap-4">
          <Link href={routes.home} className="rounded-sm" aria-label="jagomoko home">
            <Wordmark />
          </Link>
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((n) => {
              const active = n.match(pathname);
              return (
                <Link
                  key={n.label}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center rounded-sm px-3 text-sm font-medium transition-colors duration-(--dur-micro)",
                    active ? "bg-sunken text-ink" : "text-subtle hover:text-ink",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <SampleChip className="hidden sm:inline-flex" />
            <AccountChip />
          </div>
        </div>
      </header>

      <main id="main" className="container-page py-6 md:py-10">
        {children}
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid h-16 grid-cols-4">
          {NAV.map((n) => {
            const active = n.match(pathname);
            const Icon = n.icon;
            return (
              <li key={n.label}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-full flex-col items-center justify-center gap-1 text-2xs font-medium",
                    active ? "text-ink" : "text-subtle",
                  )}
                >
                  {active ? <span className="absolute top-1.5 size-1 rounded-full bg-signal" aria-hidden /> : null}
                  <Icon className="size-5" aria-hidden />
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
