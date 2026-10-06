"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { motionOff } from "@/lib/motion";
import { useInView } from "@/lib/use-in-view";
import type { MascotName } from "@/lib/mascots";
import { Mascot } from "./mascot";

const IDLE = { bob: "animate-mascot-bob", wave: "animate-mascot-wave origin-bottom" } as const;

/**
 * A mascot with a slow idle (a bob or a wave) that only runs while it is on screen, and never under
 * reduced motion or ?motion=off. A tap squishes it, for the people who will try.
 */
export function LiveMascot({
  name,
  height,
  idle = "bob",
  className,
  wrapperClassName,
}: {
  name: MascotName;
  height: number;
  idle?: keyof typeof IDLE;
  className?: string;
  wrapperClassName?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [still, setStill] = React.useState(true);
  const [squishing, setSquishing] = React.useState(false);
  React.useEffect(() => setStill(motionOff()), []);

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("pointer-events-auto origin-bottom select-none", squishing && "animate-mascot-squish", wrapperClassName)}
      onPointerDown={() => {
        if (!still) setSquishing(true);
      }}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setSquishing(false);
      }}
    >
      <Mascot name={name} height={height} className={cn(!still && inView && IDLE[idle], className)} />
    </div>
  );
}
