"use client";

import * as React from "react";
import { ArrowUpRight, Check, X as XIcon, AlertCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type ToastTone = "default" | "success" | "danger" | "levelup";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** ms; default 5000, or 8000 when there is a link to follow */
  duration?: number;
  /** a link under the text, like "View on Monadscan"; opens in a new tab */
  action?: { label: string; href: string };
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = React.createContext<{ push: (t: ToastInput) => void } | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const ICONS: Record<ToastTone, React.ReactNode> = {
  default: null,
  success: <Check className="size-4 text-success" aria-hidden />,
  danger: <AlertCircle className="size-4 text-danger" aria-hidden />,
  levelup: <Sparkles className="size-4 text-signal" aria-hidden />,
};

/**
 * One toast at a time, with a "+N more" counter. Auto-dismisses after 5s and
 * pauses while hovered or focused. Announced politely via role="status".
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = React.useState<ToastItem[]>([]);
  const [paused, setPaused] = React.useState(false);
  const nextId = React.useRef(1);
  const current = queue[0];

  const push = React.useCallback((t: ToastInput) => {
    setQueue((q) => [...q, { ...t, id: nextId.current++ }]);
  }, []);

  const dismiss = React.useCallback(() => setQueue((q) => q.slice(1)), []);

  React.useEffect(() => {
    if (!current || paused) return;
    const id = window.setTimeout(dismiss, current.duration ?? (current.action ? 8000 : 5000));
    return () => window.clearTimeout(id);
  }, [current, paused, dismiss]);

  const value = React.useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 md:inset-x-auto md:bottom-6 md:right-6 md:justify-end md:px-0"
      >
        {current ? (
          <div
            key={current.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-[360px] animate-toast-in items-start gap-3 rounded-md bg-surface p-3.5 shadow-md",
              current.tone === "levelup" && "ring-1 ring-signal/30",
            )}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            {ICONS[current.tone ?? "default"] ? <span className="mt-0.5">{ICONS[current.tone ?? "default"]}</span> : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{current.title}</p>
              {current.description ? <p className="mt-0.5 text-sm text-muted">{current.description}</p> : null}
              {current.action ? (
                <a
                  href={current.action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-0.5 rounded-xs text-sm font-medium text-signal-ink underline-offset-2 hover:underline"
                >
                  {current.action.label}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </a>
              ) : null}
              {queue.length > 1 ? <p className="mt-1.5 font-mono text-2xs text-subtle">+{queue.length - 1} more</p> : null}
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="-mr-1 -mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-subtle transition hover:bg-sunken hover:text-ink"
              aria-label="Dismiss"
            >
              <XIcon className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
