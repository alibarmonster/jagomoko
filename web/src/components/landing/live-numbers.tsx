"use client";

import * as React from "react";
import { SAMPLE_DATA } from "@/lib/config";
import { formatInt, formatUsd, type Usd } from "@/lib/money";
import { cn } from "@/lib/cn";
import { motionOff } from "@/lib/motion";

export interface Stat {
  label: string;
  /** Whole dollars display as money, everything else as an integer. `null` renders an em dash. */
  value: bigint | null;
  kind: "usd" | "count";
}

function format(stat: Stat, v: bigint) {
  return stat.kind === "usd" ? formatUsd(v as Usd, { cents: "never" }) : formatInt(v);
}

function CountUp({ stat }: { stat: Stat }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [shown, setShown] = React.useState<bigint | null>(stat.value);

  React.useEffect(() => {
    const el = ref.current;
    const target = stat.value;
    if (!el || target === null) return;
    if (motionOff()) return;

    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const duration = 900;
        setShown(0n);
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out
          setShown(BigInt(Math.round(Number(target) * eased)));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [stat.value]);

  return (
    <span ref={ref} className="font-mono text-num font-semibold text-ink tnum">
      {shown === null ? "—" : format(stat, shown)}
    </span>
  );
}

/**
 * Label left, big mono figure right, hairline between rows. Figures count up
 * once when 30% visible. A missing value renders an em dash — never an invented number.
 */
export function StatRows({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <div className={className}>
      <dl className="divide-y divide-line border-y border-line">
        {stats.map((s) => (
          <div key={s.label} className="flex items-baseline justify-between gap-6 py-5 md:py-7">
            <dt className="text-base text-ink md:text-lg">{s.label}</dt>
            <dd>
              <CountUp stat={s} />
            </dd>
          </div>
        ))}
      </dl>
      <p className={cn("mt-3 font-mono text-2xs text-subtle")}>
        {SAMPLE_DATA ? "Sample data · Monad testnet" : "Monad testnet · updated live"}
      </p>
    </div>
  );
}
