"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { clamp, squash, switchLands } from "@/lib/utils/drag";
import { motionOff } from "@/lib/utils/motion";

// track 44x24 with a 3px inset, so the 18px thumb travels 20px
const TRAVEL = 20;
const STRETCH = 0.4;

/** Moves the thumb from `from` to `to`: it stretches in flight and squashes against the end. */
function flick(el: HTMLElement, from: number, to: number) {
  el.style.transform = `translateX(${to}px)`;
  if (motionOff() || from === to) return;
  el.style.transformOrigin = to > from ? "right center" : "left center";
  const mid = from + (to - from) * 0.6;
  el.animate(
    [
      { transform: `translateX(${from}px) scale(1, 1)` },
      { transform: `translateX(${mid}px) scale(${1 + STRETCH}, ${1 / (1 + STRETCH)})`, offset: 0.45 },
      { transform: `translateX(${to}px) scale(0.82, 1.14)`, offset: 0.75 },
      { transform: `translateX(${to}px) scale(1, 1)` },
    ],
    { duration: 460, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

/**
 * A two-state switch with a squishy thumb: tap it, flick it, or drag it past the middle. The thumb
 * stretches with the speed of the drag and squashes when it lands. Labels on both sides name the
 * two states and can be tapped too. `role="switch"`, so Space and Enter toggle it; the arrows pick a side.
 */
export function SquishSwitch({
  checked,
  onCheckedChange,
  label,
  offLabel,
  onLabel,
  offHint,
  onHint,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** what "on" means, for screen readers */
  label: string;
  offLabel?: string;
  onLabel?: string;
  offHint?: string;
  onHint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const thumb = React.useRef<HTMLSpanElement>(null);
  const was = React.useRef(checked);
  // set after a drag, so the settle starts where the finger let go
  const releasedAt = React.useRef<number | null>(null);
  const drag = React.useRef<{ id: number; x0: number; start: number; x: number; t: number; offset: number; moved: boolean } | null>(null);
  const swallowClick = React.useRef(false);

  React.useLayoutEffect(() => {
    const el = thumb.current;
    if (!el) return;
    const to = checked ? TRAVEL : 0;
    const from = releasedAt.current ?? (was.current ? TRAVEL : 0);
    releasedAt.current = null;
    was.current = checked;
    flick(el, from, to);
  }, [checked]);

  const set = (next: boolean) => {
    if (disabled || next === checked) return;
    onCheckedChange(next);
  };

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = checked ? TRAVEL : 0;
    drag.current = { id: e.pointerId, x0: e.clientX, start, x: e.clientX, t: e.timeStamp, offset: start, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    const el = thumb.current;
    if (!d || d.id !== e.pointerId || !el) return;
    const dx = e.clientX - d.x0;
    if (Math.abs(dx) > 3) d.moved = true;
    if (!d.moved) return;
    const offset = clamp(d.start + dx, 0, TRAVEL);
    const velocity = (e.clientX - d.x) / Math.max(1, e.timeStamp - d.t);
    d.x = e.clientX;
    d.t = e.timeStamp;
    d.offset = offset;
    const { sx, sy } = motionOff() ? { sx: 1, sy: 1 } : squash(velocity, STRETCH);
    el.style.transformOrigin = "center";
    el.style.transform = `translateX(${offset}px) scale(${sx}, ${sy})`;
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.moved) return; // a tap is handled by the click
    swallowClick.current = true;
    const next = switchLands(d.offset, TRAVEL, checked, true);
    if (next === checked) {
      if (thumb.current) flick(thumb.current, d.offset, checked ? TRAVEL : 0);
      return;
    }
    releasedAt.current = d.offset;
    set(next);
  }

  const side = (on: boolean, text: string | undefined, hint: string | undefined) =>
    text ? (
      <span
        aria-hidden
        title={hint}
        onClick={() => set(on)}
        className={cn(
          "cursor-pointer select-none font-mono text-2xs font-medium transition-colors duration-(--dur-micro)",
          checked === on ? "text-ink" : "text-subtle hover:text-ink",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {text}
      </span>
    ) : null;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {side(false, offLabel, offHint)}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          if (swallowClick.current) {
            swallowClick.current = false;
            return;
          }
          set(!checked);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") set(true);
          else if (e.key === "ArrowLeft") set(false);
          else return;
          e.preventDefault();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          if (thumb.current) flick(thumb.current, checked ? TRAVEL : 0, checked ? TRAVEL : 0);
        }}
        className={cn(
          "relative h-6 w-11 shrink-0 touch-none rounded-full border transition-colors duration-[320ms] ease-out",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:opacity-50",
          checked ? "border-ink bg-ink" : "border-line-strong bg-sunken hover:border-subtle",
        )}
      >
        <span
          ref={thumb}
          aria-hidden
          className="absolute left-[2px] top-[2px] size-[18px] rounded-full bg-white shadow-sm will-change-transform"
          style={{ transform: `translateX(${checked ? TRAVEL : 0}px)` }}
        />
      </button>
      {side(true, onLabel, onHint)}
    </span>
  );
}
