import * as React from "react";
import { cn } from "@/lib/cn";
import { formatUsd, type Usd } from "@/lib/money";
import { splitAmount, poolShare, type Split } from "@/lib/outcomes";

/** XP / progress bar: 4px track, signal fill, scaleX (transform-only) animation. */
export function XPBar({
  value,
  size = "sm",
  className,
  label,
}: {
  /** 0–1 */
  value: number;
  size?: "sm" | "lg";
  className?: string;
  label?: string;
}) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label ?? "Progress"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn("w-full overflow-hidden rounded-full bg-line", size === "lg" ? "h-1.5" : "h-1", className)}
    >
      <div
        className="h-full w-full origin-left rounded-full bg-signal transition-transform duration-700 ease-in-out"
        style={{ transform: `scaleX(${v})` }}
      />
    </div>
  );
}

/** Level ring: 2px track, signal arc = XP progress, level numeral inside. */
export function LevelRing({
  level,
  progress,
  size = 24,
  className,
}: {
  level: number;
  /** 0–1 progress to the next level */
  progress: number;
  size?: number;
  className?: string;
}) {
  const stroke = size >= 48 ? 3 : 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-signal)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-in-out"
        />
      </svg>
      <span
        className="absolute font-mono font-semibold leading-none text-ink tnum"
        style={{ fontSize: Math.max(9, Math.round(size * 0.42)) }}
      >
        {level}
      </span>
    </span>
  );
}

const SEGMENTS = [
  { key: "creator", label: "creator", bar: "bg-ink", swatch: "bg-ink" },
  { key: "treasury", label: "treasury", bar: "bg-signal", swatch: "bg-signal" },
  { key: "community", label: "community", bar: "bg-line-strong hatch", swatch: "bg-line-strong hatch" },
] as const;

/**
 * Where each dollar goes: creator (ink) · treasury (signal) · community (hatched).
 * Pass `amount` for dollar figures in the legend, omit for percentages.
 */
export function SplitBar({
  split,
  amount,
  legend = true,
  animate = true,
  className,
}: {
  split: Split;
  amount?: Usd;
  legend?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const bps = [split.creatorBps, split.treasuryBps, split.communityBps];
  const amounts = amount === undefined ? null : splitAmount(amount, split);
  const values = amounts ? [amounts.creator, amounts.treasury, amounts.community] : null;
  return (
    <div className={cn("w-full", className)}>
      <div className="flex h-1.5 w-full gap-0.5" role="img" aria-label={`Split: ${bps.map((b, i) => `${b / 100}% ${SEGMENTS[i]!.label}`).join(", ")}`}>
        {SEGMENTS.map((s, i) =>
          bps[i]! > 0 ? (
            <div
              key={s.key}
              className={cn("h-full origin-left rounded-full", s.bar, animate && "animate-bar-grow")}
              style={{ flexGrow: bps[i], flexBasis: 0, animationDelay: `${i * 60}ms` }}
            />
          ) : null,
        )}
      </div>
      {legend ? (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted tnum">
          {SEGMENTS.map((s, i) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-xs", s.swatch)} aria-hidden />
              <span>
                {values ? formatUsd(values[i]!, { cents: "always" }) : `${bps[i]! / 100}%`} {s.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Two-sided pool bar: side A (ink) from the left, side B (stone) from the right, a canvas gap between. */
export function TugBar({
  pools,
  className,
}: {
  pools: readonly [Usd, Usd];
  className?: string;
}) {
  const share = poolShare(pools);
  return (
    <div
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-line-strong", className)}
      role="img"
      aria-label={`Pool split: ${Math.round(share * 100)}% on the first side, ${Math.round((1 - share) * 100)}% on the second`}
    >
      <div
        className="absolute inset-0 origin-left bg-ink transition-transform duration-(--dur-section) ease-in-out"
        style={{ transform: `scaleX(${share})` }}
      />
      <div
        className="absolute inset-0 transition-transform duration-(--dur-section) ease-in-out"
        style={{ transform: `translateX(${share * 100}%)` }}
      >
        <span className="absolute inset-y-0 left-0 -ml-px w-0.5 bg-canvas" />
      </div>
    </div>
  );
}
