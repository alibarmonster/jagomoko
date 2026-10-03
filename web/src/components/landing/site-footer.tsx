import * as React from "react";
import Link from "next/link";
import { LogoMark } from "@/components/ui/sigil";
import { routes } from "@/lib/routes";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "Quests", href: "/#quests" },
      { label: "Battles", href: "/#battles" },
      { label: "Fair by design", href: "/#fair" },
    ],
  },
  {
    title: "Creators",
    links: [
      { label: "Creator studio", href: routes.studio },
      { label: "Overlay for OBS", href: routes.studioOverlay },
      { label: "Split settings", href: routes.studioSettings },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Treasury", href: routes.treasury() },
      { label: "Jury", href: routes.jury },
      { label: "Leaderboard", href: routes.board },
    ],
  },
] as const;

/** Continues the inverse band: wordmark, three link columns, then a quiet bottom row. */
export function SiteFooter() {
  return (
    <footer className="bg-inverse text-on-inverse">
      <div className="container-page border-t border-on-inverse/10 py-14">
        <div className="grid gap-10 md:grid-cols-[1.2fr_repeat(3,1fr)]">
          <div>
            <span className="inline-flex items-center gap-2 text-base font-medium tracking-[-0.01em]">
              <LogoMark />
              jagomoko
            </span>
            <p className="mt-3 max-w-[26ch] text-sm text-on-inverse-muted">A co-op game for streams, built on Monad.</p>
          </div>
          {COLUMNS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h2 className="text-sm font-medium">{c.title}</h2>
              <ul className="mt-3 space-y-2">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="rounded-xs text-sm text-on-inverse-muted transition-colors hover:text-on-inverse">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col justify-between gap-2 border-t border-on-inverse/10 pt-6 font-mono text-2xs text-on-inverse-muted sm:flex-row">
          <p>&copy; 2026 jagomoko &middot; Built on Monad</p>
          <p>Running on testnet &middot; no real money</p>
        </div>
      </div>
    </footer>
  );
}
