import * as React from "react";
import type { Role } from "@/lib/roles";
import { cn } from "@/lib/cn";

/**
 * Role sigils: custom glyphs on a 24px grid, 1.5px stroke, so they sit next to
 * Lucide icons. Roles are told apart by sigil + name, never by color.
 */
type SvgProps = React.SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function KnightSigil(props: SvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M12 3.2 19 5.6v5.9c0 4.3-2.9 7.6-7 9.3-4.1-1.7-7-5-7-9.3V5.6L12 3.2Z" />
      <path d="M12 3.6v17" />
    </svg>
  );
}

export function SeerSigil(props: SvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M2.8 12C5 8.1 8.2 6 12 6s7 2.1 9.2 6c-2.2 3.9-5.4 6-9.2 6s-7-2.1-9.2-6Z" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function JudgeSigil(props: SvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M12 4.5v15M7.5 19.5h9M5 7.2h14" />
      <path d="M5 7.2 2.8 12.6M5 7.2l2.2 5.4M2.8 12.6h4.4c0 1.5-1 2.5-2.2 2.5s-2.2-1-2.2-2.5Z" />
      <path d="M19 7.2l-2.2 5.4M19 7.2l2.2 5.4M16.8 12.6h4.4c0 1.5-1 2.5-2.2 2.5s-2.2-1-2.2-2.5Z" />
    </svg>
  );
}

export function BardSigil(props: SvgProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M3 6q1.5-5.2 3 0t3 0 3 0 3 0 3 0 3 0" />
      <path d="M3 12q1.5-3.6 3 0t3 0 3 0 3 0 3 0 3 0" />
      <path d="M3 18q1.5-2 3 0t3 0 3 0 3 0 3 0 3 0" />
    </svg>
  );
}

const SIGILS: Record<Role, (props: SvgProps) => React.JSX.Element> = {
  Knight: KnightSigil,
  Seer: SeerSigil,
  Judge: JudgeSigil,
  Bard: BardSigil,
};

export function RoleSigil({ role, className, ...props }: { role: Role } & SvgProps) {
  const Cmp = SIGILS[role];
  return <Cmp className={cn("size-5", className)} {...props} />;
}

/** The jagomoko mark: Moko's face (public/brand, cut by `bun run mascots`). */
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a tiny fixed-size mark
    <img src="/brand/logo-64.png" srcSet="/brand/logo-64.png 1x, /brand/logo-128.png 2x" alt="" aria-hidden width={24} height={24} className={cn("size-6 select-none", className)} draggable={false} />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-base font-medium tracking-[-0.01em] text-ink", className)}>
      <LogoMark />
      jagomoko
    </span>
  );
}
