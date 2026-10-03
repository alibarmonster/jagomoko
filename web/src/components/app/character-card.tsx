import * as React from "react";
import { cn } from "@/lib/cn";
import { hashHue } from "@/lib/format";
import { formatUsd, type Usd } from "@/lib/money";
import { ROLE_META, type Role } from "@/lib/roles";
import { levelProgress } from "@/lib/xp";
import { RoleSigil } from "@/components/ui/sigil";
import { XPBar } from "@/components/ui/progress";
import { StatList } from "@/components/ui/card";

/** Deterministic PRNG so a crest is identical on the server and the client. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Address-seeded contour lines: a subtle, unique crest per character. Never colorful. */
export function crestPaths(seed: string, w = 320, h = 128, lines = 9): string[] {
  const rnd = mulberry32(hashHue(seed) * 7919 + seed.length);
  const out: string[] = [];
  for (let i = 0; i < lines; i++) {
    const y = ((i + 1) * h) / (lines + 1);
    const a = () => (rnd() * 2 - 1) * (10 + rnd() * 22);
    out.push(
      `M0 ${(y + a() * 0.3).toFixed(1)} C ${(w * 0.25).toFixed(1)} ${(y + a()).toFixed(1)}, ${(w * 0.5).toFixed(1)} ${(y + a()).toFixed(1)}, ${(w * 0.75).toFixed(1)} ${(y + a()).toFixed(1)} S ${(w * 0.92).toFixed(1)} ${(y + a()).toFixed(1)}, ${w} ${(y + a() * 0.3).toFixed(1)}`,
    );
  }
  return out;
}

export function Crest({ seed, className }: { seed: string; className?: string }) {
  const paths = crestPaths(seed);
  return (
    <svg viewBox="0 0 320 128" preserveAspectRatio="none" className={cn("h-full w-full", className)} aria-hidden>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--color-line-strong)" strokeWidth="1" opacity={0.55 + (i % 3) * 0.15} />
      ))}
    </svg>
  );
}

const sinceFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export interface CharacterCardProps {
  name: string;
  role: Role;
  xp: bigint;
  /** seeds the crest */
  address: string;
  number?: number;
  stats?: { backed?: Usd; won?: Usd; tipped?: Usd; since?: number };
  compact?: boolean;
  className?: string;
}

/** The identity object: sigil, role, a quiet crest, a huge mono level numeral and the XP bar. */
export function CharacterCard({ name, role, xp, address, number, stats, compact = false, className }: CharacterCardProps) {
  const p = levelProgress(xp);
  const rows = [
    stats?.backed !== undefined ? { label: "Backed", value: formatUsd(stats.backed) } : null,
    stats?.won !== undefined ? { label: "Won", value: formatUsd(stats.won) } : null,
    stats?.tipped !== undefined ? { label: "Tipped", value: formatUsd(stats.tipped) } : null,
    stats?.since !== undefined ? { label: "Since", value: sinceFmt.format(stats.since) } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <article
      className={cn("flex w-full flex-col overflow-hidden rounded-lg border border-line bg-surface", compact ? "max-w-[260px]" : "max-w-[340px]", className)}
      aria-label={`${name}, level ${p.level} ${role}`}
    >
      <header className="flex items-center justify-between px-4 pt-4">
        <span className="flex items-center gap-2.5">
          <RoleSigil role={role} className={compact ? "size-8" : "size-10"} />
          <span className="font-mono text-2xs text-subtle">{role}</span>
        </span>
        {number !== undefined ? <span className="font-mono text-2xs text-subtle tnum">#{String(number).padStart(4, "0")}</span> : null}
      </header>

      <div className={cn("mt-3 border-y border-line bg-sunken/60", compact ? "h-16" : "h-28")}>
        <Crest seed={address} />
      </div>

      <div className="px-4 pb-4 pt-3">
        <p className="truncate text-xl text-ink">{name}</p>
        <p className="mt-0.5 text-sm text-muted">{ROLE_META[role].tagline}</p>

        <div className="mt-3 flex items-end justify-between">
          <div>
            <span className="block font-mono text-2xs text-subtle">LVL</span>
            <span className={cn("block font-mono font-semibold leading-none text-ink tnum", compact ? "text-3xl" : "text-num")}>
              {p.level}
            </span>
          </div>
          <span className="pb-1 font-mono text-xs text-subtle tnum">
            {xp.toString()} / {p.ceil.toString()} XP
          </span>
        </div>
        <XPBar value={p.pct} size="lg" className="mt-2.5" label={`XP progress to level ${p.level + 1}`} />

        {!compact && rows.length > 0 ? <StatList rows={rows} className="mt-3" /> : null}
      </div>
    </article>
  );
}
