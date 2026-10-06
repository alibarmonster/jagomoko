"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

/** Half the thumb's width (size-5): Radix keeps the thumb inside the track by shifting it this much at the ends. */
const HALF_THUMB_PX = 10;

/** Where the thumb's center sits for `value`, as CSS `left` (Radix's in-bounds offset included). */
function thumbLeft(value: number, min: number, max: number): string {
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const offset = HALF_THUMB_PX - (percent / 50) * HALF_THUMB_PX;
  return `calc(${percent}% + ${offset}px)`;
}

/**
 * Single-thumb slider with an ink range and a white thumb. Accessible via Radix
 * (arrows, Home/End, PageUp/Down). The thumb is the focusable control, so it
 * needs its own accessible name: pass `label`. `mark` draws a violet tick at a
 * value worth seeing next to the thumb (e.g. where the setting is now); say
 * what it means in text nearby, since the tick itself is decorative.
 */
export const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { rangeClassName?: string; label: string; mark?: number }
>(function Slider({ className, rangeClassName, label, mark, min = 0, max = 100, ...props }, ref) {
  return (
    <SliderPrimitive.Root ref={ref} min={min} max={max} className={cn("relative flex h-5 w-full touch-none select-none items-center", className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-line">
        <SliderPrimitive.Range className={cn("absolute h-full bg-ink", rangeClassName)} />
      </SliderPrimitive.Track>
      {mark !== undefined ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal"
          style={{ left: thumbLeft(mark, min, max) }}
        />
      ) : null}
      <SliderPrimitive.Thumb
        aria-label={label}
        className="block size-5 rounded-full border border-line-strong bg-white shadow-sm transition-transform duration-(--dur-micro) hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  );
});

/** Value labels under a Slider, each centered where the thumb sits at that value. Decorative: the thumb announces its value. */
export function SliderScale({ min, max, values, format, className }: { min: number; max: number; values: number[]; format: (v: number) => string; className?: string }) {
  return (
    <div aria-hidden className={cn("relative h-4 font-mono text-2xs text-subtle tnum", className)}>
      {values.map((v) => (
        <span key={v} className="absolute top-0 -translate-x-1/2" style={{ left: thumbLeft(v, min, max) }}>
          {format(v)}
        </span>
      ))}
    </div>
  );
}
