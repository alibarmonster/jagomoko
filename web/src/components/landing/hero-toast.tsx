"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import type { Role } from "@/lib/roles";
import { motionOff } from "@/lib/motion";

const EVENTS: { name: string; role: Role; level: number; text: string }[] = [
  { name: "Alice", role: "Knight", level: 7, text: "backed $10" },
  { name: "Hana", role: "Seer", level: 4, text: "picked Win with $20" },
  { name: "Carol", role: "Judge", level: 6, text: "joined the jury" },
];

/**
 * The floating alert over the hero: "Lv.7 Knight Alice backed $10". It cycles
 * every 6 seconds while on screen and shows one static message under reduced
 * motion. Illustration only — it is labelled by the surrounding sample frame.
 */
export function HeroToast() {
  const [i, setI] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (motionOff()) return;
    const el = ref.current;
    if (!el) return;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    io.observe(el);
    const id = window.setInterval(() => {
      if (visible && !document.hidden) setI((n) => (n + 1) % EVENTS.length);
    }, 6000);
    return () => {
      io.disconnect();
      window.clearInterval(id);
    };
  }, []);

  const e = EVENTS[i]!;
  return (
    <div
      ref={ref}
      data-hero="toast"
      aria-hidden="true"
      className="pointer-events-none absolute bottom-12 left-4 z-20 sm:left-8 lg:bottom-14 lg:left-[3%] xl:left-[4%]"
    >
      <div key={i} className={cn("flex items-center gap-3 rounded-md bg-surface p-3 pr-4 shadow-md", i > 0 && "animate-toast-in")}>
        <Avatar name={e.name} role={e.role} size={32} />
        <div>
          <p className="text-sm text-ink">
            <span className="font-mono text-xs text-signal-ink tnum">Lv.{e.level}</span> {e.role} <span className="font-medium">{e.name}</span> {e.text}
          </p>
          <p className="font-mono text-2xs text-subtle">just now</p>
        </div>
      </div>
    </div>
  );
}
