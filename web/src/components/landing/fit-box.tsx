"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Scales a fixed-width product composite down to fit its frame (never up), so a
 * real component can sit inside any photo frame without being cropped. The
 * content keeps its design width; only a transform changes. Hidden until
 * measured to avoid a flash of oversized content.
 */
export function FitBox({
  width,
  children,
  className,
  inset = "inset-3 sm:inset-5",
  align = "center",
}: {
  /** The composite's design width in px */
  width: number;
  children: React.ReactNode;
  className?: string;
  /** Tailwind inset utilities for the stage inside the frame */
  inset?: string;
  align?: "center" | "start";
}) {
  const stage = React.useRef<HTMLDivElement>(null);
  const inner = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState<number | null>(null);

  useIsoLayoutEffect(() => {
    const s = stage.current;
    const i = inner.current;
    if (!s || !i) return;
    const measure = () => {
      const next = Math.min(1, s.clientWidth / i.offsetWidth, s.clientHeight / i.offsetHeight);
      setScale((prev) => (prev !== null && Math.abs(prev - next) < 0.001 ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(s);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="absolute inset-0">
      <div
        ref={stage}
        className={cn("absolute flex", inset, align === "center" ? "items-center justify-center" : "items-center justify-start", className)}
      >
        <div
          ref={inner}
          className="shrink-0"
          style={{
            width,
            transform: `scale(${scale ?? 1})`,
            transformOrigin: align === "center" ? "center" : "left center",
            visibility: scale === null ? "hidden" : "visible",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
