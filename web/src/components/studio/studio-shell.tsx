"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, ExternalLink, Flag, Landmark, LayoutDashboard, Menu, MonitorPlay, Scale, SlidersHorizontal, Swords } from "lucide-react";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wordmark } from "@/components/ui/sigil";
import { SampleChip } from "@/components/app/app-shell";
import { IndexerBanner } from "@/components/app/indexer-banner";
import { sampleAddress } from "@/lib/data/sample";
import { useSession } from "@/components/session";
import { useRealmHandle } from "./studio-core";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  outside?: boolean;
  /** for links that depend on the realm: given its handle */
  forHandle?: (handle: string) => string;
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Guild",
    items: [
      { href: routes.studio, label: "Overview", icon: LayoutDashboard, exact: true },
      { href: routes.studioQuests, label: "Quests", icon: Flag },
      { href: routes.studioBattles, label: "Battles", icon: Swords },
      { href: routes.studioClips, label: "Clips & bounties", icon: Clapperboard },
    ],
  },
  {
    group: "Community",
    items: [
      { href: "#", label: "Treasury", icon: Landmark, outside: true, forHandle: routes.treasury },
      { href: routes.jury, label: "Jury", icon: Scale, outside: true },
    ],
  },
  {
    group: "Broadcast",
    items: [{ href: routes.studioOverlay, label: "Overlay", icon: MonitorPlay }],
  },
  {
    group: "Settings",
    items: [{ href: routes.studioSettings, label: "Split & team", icon: SlidersHorizontal }],
  },
];

function isActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const handle = useRealmHandle();
  return (
    <nav aria-label="Studio" className="space-y-5">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="px-2 font-mono text-2xs text-subtle">{g.group}</p>
          <ul className="mt-1.5 space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(item, pathname);
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <Link
                    href={item.forHandle ? item.forHandle(handle) : item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-sm px-2 text-sm font-medium transition-colors duration-(--dur-micro)",
                      active ? "bg-sunken text-ink" : "text-muted hover:bg-sunken/70 hover:text-ink",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                    {item.outside ? <ExternalLink className="ml-auto size-3 text-faint" aria-hidden /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Creator studio shell, compact density: a 240px sidebar with a hairline edge,
 * a 48px breadcrumb bar, then content on white panels.
 */
export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = NAV.flatMap((g) => g.items).find((i) => isActive(i, pathname));
  const session = useSession();
  const handle = useRealmHandle();
  const owner = session.address ?? sampleAddress("neonblade-owner");

  return (
    <div className="min-h-dvh bg-canvas md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-canvas px-3 py-4 md:flex">
        <Link href={routes.home} className="rounded-sm px-2" aria-label="jagomoko home">
          <Wordmark />
        </Link>
        <p className="mt-1 px-2 font-mono text-2xs text-subtle">Creator studio</p>
        <div className="mt-6 flex-1 overflow-y-auto">
          <NavList pathname={pathname} />
        </div>
        <div className="border-t border-line pt-3">
          <Link href={routes.realm(handle)} className="flex items-center gap-2.5 rounded-sm p-2 transition-colors hover:bg-sunken">
            <Avatar name={handle} seed={owner} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{handle}</span>
              <span className="block font-mono text-2xs text-subtle">View my guild</span>
            </span>
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur-md md:px-6">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open studio menu">
                <Menu aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent width="sm">
              <DialogTitle className="sr-only">Studio menu</DialogTitle>
              <DialogDescription className="sr-only">Studio navigation</DialogDescription>
              <div className="-mx-1">
                <DialogClose asChild>
                  <span>
                    <NavList pathname={pathname} />
                  </span>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
            <span className="text-subtle">Studio</span>
            <span className="text-subtle" aria-hidden>
              /
            </span>
            <span className="font-medium text-ink">{current?.label ?? "Overview"}</span>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <SampleChip className="hidden sm:inline-flex" />
            <Link href={routes.realm(handle)} className="rounded-sm text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              View guild
            </Link>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1100px] p-4 md:p-6 lg:p-8">
          <IndexerBanner className="mb-6" />
          {children}
        </main>
      </div>
    </div>
  );
}
