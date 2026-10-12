"use client";

import * as React from "react";
import { ArrowRight, Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { clamp, progressOf, slideCommits } from "@/lib/utils/drag";
import { motionOff } from "@/lib/utils/motion";

type Phase = "idle" | "drag" | "pending" | "done" | "error";

// the track has a 4px inset around the 48px handle
const INSET = 4;
const HANDLE = 48;
const DONE_MS = 1500;
const ERROR_MS = 2200;

/**
 * Slide to confirm: drag the handle to the end (or focus it and press Enter) and `onConfirm` runs.
 * The handle spins while it runs; on success the pill fills green with `doneLabel`, then resets; on a
 * failure the handle springs home and the label says so for a moment (the caller shows the reason).
 */
export function SlideToConfirm({
  label,
  doneLabel,
  errorLabel = "Didn’t go through. Try again",
  disabled,
  onConfirm,
  className,
}: {
  label: string;
  doneLabel: string;
  errorLabel?: string;
  /** shown as the label while disabled, e.g. "Pick an amount" */
  disabled?: boolean;
  /** resolves true when it went through */
  onConfirm: () => Promise<boolean>;
  className?: string;
}) {
  const track = React.useRef<HTMLDivElement>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [offset, setOffset] = React.useState(0);
  const [travel, setTravel] = React.useState(0);
  const drag = React.useRef<{ id: number; x0: number } | null>(null);
  const timer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => setTravel(Math.max(0, el.clientWidth - HANDLE - INSET * 2));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const later = (ms: number, fn: () => void) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };

  async function commit() {
    setOffset(travel);
    setPhase("pending");
    let ok = false;
    try {
      ok = await onConfirm();
    } catch {
      ok = false;
    }
    if (ok) {
      setPhase("done");
      later(DONE_MS, () => {
        setPhase("idle");
        setOffset(0);
      });
    } else {
      setPhase("error");
      setOffset(0);
      later(ERROR_MS, () => setPhase("idle"));
    }
  }

  const locked = disabled || phase === "pending" || phase === "done";

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (locked || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x0: e.clientX };
    setPhase("drag");
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setOffset(clamp(e.clientX - d.x0, 0, travel));
  }
  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (slideCommits(offset, travel)) {
      void commit();
      return;
    }
    setPhase("idle");
    setOffset(0);
  }

  const progress = progressOf(offset, travel);
  const dragging = phase === "drag";
  // a springy return; no easing while the finger leads
  const move = dragging || motionOff() ? "none" : "transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1), width 420ms cubic-bezier(0.34, 1.56, 0.64, 1)";
  const text = disabled ? label : phase === "error" ? errorLabel : label;

  return (
    <div
      ref={track}
      className={cn(
        "relative h-14 w-full select-none overflow-hidden rounded-full transition-colors duration-(--dur-ui)",
        disabled ? "bg-sunken" : "bg-ink",
        className,
      )}
    >
      {/* the ground the handle paints as it goes */}
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-full bg-white/12"
        style={{ width: HANDLE + offset, transition: move }}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center pl-12 pr-4 text-sm font-medium",
          disabled ? "text-faint" : phase === "error" ? "text-[#f3b4a7]" : "text-on-inverse-muted",
        )}
        style={{ opacity: phase === "done" ? 0 : 1 - progress * 1.15 }}
      >
        {text}
      </span>

      <button
        type="button"
        disabled={locked}
        aria-label={disabled ? label : `${label}. Press Enter to confirm.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setPhase("idle");
          setOffset(0);
        }}
        onClick={(e) => {
          // a keyboard press confirms; a mouse click without a slide only nudges, to show the way
          if (e.detail === 0) void commit();
          else if (!dragging && offset === 0 && !locked && !motionOff()) {
            e.currentTarget.animate([{ transform: "translateX(0)" }, { transform: "translateX(14px)" }, { transform: "translateX(0)" }], {
              duration: 420,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            });
          }
        }}
        className={cn(
          "absolute left-1 top-1 inline-flex size-12 touch-none items-center justify-center rounded-full shadow-sm",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
          disabled ? "cursor-not-allowed bg-surface text-faint" : "cursor-grab bg-surface text-ink active:cursor-grabbing",
          phase === "error" && "text-danger",
        )}
        style={{ transform: `translateX(${offset}px)`, transition: move }}
      >
        {phase === "pending" ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : phase === "error" ? (
          <X className="size-5" aria-hidden />
        ) : (
          <ArrowRight className="size-5" aria-hidden />
        )}
      </button>

      {/* the done pill unfurls from the handle across the track */}
      {phase === "done" ? (
        <span
          role="status"
          className="absolute inset-1 flex items-center justify-center gap-2 rounded-full bg-success text-sm font-medium text-white"
          style={{ animation: motionOff() ? undefined : "slide-done 420ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
        >
          <Check className="size-4" aria-hidden />
          {doneLabel}
        </span>
      ) : null}
    </div>
  );
}
