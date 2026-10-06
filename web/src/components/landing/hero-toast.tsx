"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/ui/avatar";
import { Mascot } from "@/components/ui/mascot";
import type { MascotName } from "@/lib/domain/mascots";
import type { Role } from "@/lib/domain/roles";
import { motionOff } from "@/lib/utils/motion";

const EVENTS: { name: string; role: Role; level: number; text: string; moko: MascotName }[] = [
  { name: "Alice", role: "Knight", level: 7, text: "backed $10", moko: "moko-bust-happy" },
  { name: "Hana", role: "Seer", level: 4, text: "picked Win with $20", moko: "moko-bust-wow" },
  { name: "Carol", role: "Judge", level: 6, text: "joined the jury", moko: "moko-bust-love" },
];

/**
 * The floating alert over the hero ("Lv.7 Knight Alice backed $10") and Moko in the corner, who
 * hops and changes face with every new alert, and squishes when tapped. The alert cycles every
 * 6 seconds while on screen; under reduced motion everything stays still on the first message.
 * Illustration only: it is labelled by the surrounding sample frame.
 */
export function HeroToast() {
  const [i, setI] = React.useState(0);
  const [still, setStill] = React.useState(true);
  const [squishing, setSquishing] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const off = motionOff();
    setStill(off);
    if (off) return;
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
    <>
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

      {/* Moko: every face is loaded up front and only the current one shows, so a change never flickers */}
      <div aria-hidden className="absolute bottom-0 right-0 z-10 hidden md:block">
        <div key={i} className={cn("origin-bottom", i > 0 && !still && "animate-mascot-hop")}>
          <div
            className={cn("pointer-events-auto relative origin-bottom select-none", squishing && "animate-mascot-squish")}
            onPointerDown={() => {
              if (!still) setSquishing(true);
            }}
            onAnimationEnd={(ev) => {
              if (ev.target === ev.currentTarget) setSquishing(false);
            }}
          >
            {EVENTS.map((ev, n) => (
              <Mascot
                key={ev.moko}
                name={ev.moko}
                height={200}
                eager
                className={cn(n === i ? "relative" : "absolute bottom-0 right-0 opacity-0")}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
