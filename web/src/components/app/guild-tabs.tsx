"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

const TABS = [
  { label: "Board", href: routes.realm, exact: true },
  { label: "Clips", href: routes.clips },
  { label: "Members", href: routes.members },
  { label: "Treasury", href: routes.treasury },
] as const;

/** The pages of one guild. Handles are case-insensitive in the address, so the match is too. */
export function GuildTabs({ handle, className }: { handle: string; className?: string }) {
  const pathname = (usePathname() ?? "").toLowerCase();
  return (
    <nav aria-label="Guild" className={cn("flex gap-1 overflow-x-auto border-b border-line", className)}>
      {TABS.map((tab) => {
        const href = tab.href(handle);
        const key = href.toLowerCase();
        const active = "exact" in tab ? pathname === key : pathname.startsWith(key);
        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative shrink-0 px-3 py-2.5 text-sm font-medium transition-colors duration-(--dur-micro)",
              active ? "text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-signal" : "text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
