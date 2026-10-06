"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Shows a fixed 1920×1080 broadcast canvas scaled to fit its container, so the
 * studio can preview the overlay exactly as OBS will render it.
 */
export function ScaledCanvas({ children, className }: { children: React.ReactNode; className?: string }) {
  const outer = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState<number | null>(null);

  useIsoLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / 1920);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className={cn("relative aspect-video w-full overflow-hidden", className)}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: 1920, height: 1080, transform: `scale(${scale ?? 0.4})`, visibility: scale === null ? "hidden" : "visible" }}
        aria-hidden="true"
      >
        {children}
      </div>
    </div>
  );
}
