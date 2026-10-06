import * as React from "react";
import { cn } from "@/lib/utils/cn";

const COLORS = ["var(--color-signal)", "var(--color-pending)", "var(--color-success)", "var(--color-danger)", "#ffffff", "#9fd3ff"];

/** A fixed scatter (no randomness, so the server and the browser draw the same thing). */
const PIECES = Array.from({ length: 30 }, (_, i) => {
  const angle = (i / 30) * Math.PI * 2 + ((i * 37) % 11) / 20;
  const reach = 160 + ((i * 53) % 7) * 34;
  return {
    dx: Math.round(Math.cos(angle) * reach),
    dy: Math.round(Math.sin(angle) * reach * 0.7) - 90,
    rot: ((i * 71) % 9) * 80 - 320,
    w: i % 3 === 0 ? 10 : 7,
    h: i % 3 === 0 ? 10 : 16,
    round: i % 4 === 0,
    color: COLORS[i % COLORS.length],
    delay: (i % 6) * 40,
  };
});

/**
 * One burst of confetti, in CSS only (no canvas, no library). It plays once, from the middle of its
 * box outward, then falls and fades. Callers leave it out under reduced motion.
 */
export function Confetti({ className, count = PIECES.length }: { className?: string; count?: number }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute", className)}>
      {PIECES.slice(0, count).map((p, i) => (
        <span
          key={i}
          className={cn("absolute left-1/2 top-1/2 block animate-confetti", p.round ? "rounded-full" : "rounded-[2px]")}
          style={
            {
              width: p.w,
              height: p.h,
              background: p.color,
              animationDelay: `${p.delay}ms`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
