"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

/**
 * Single-thumb slider with an ink range and a white thumb. Accessible via Radix
 * (arrows, Home/End, PageUp/Down). The thumb is the focusable control, so it
 * needs its own accessible name: pass `label`.
 */
export const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { rangeClassName?: string; label: string }
>(function Slider({ className, rangeClassName, label, ...props }, ref) {
  return (
    <SliderPrimitive.Root ref={ref} className={cn("relative flex h-5 w-full touch-none select-none items-center", className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-line">
        <SliderPrimitive.Range className={cn("absolute h-full bg-ink", rangeClassName)} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={label}
        className="block size-5 rounded-full border border-line-strong bg-white shadow-sm transition-transform duration-(--dur-micro) hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  );
});
