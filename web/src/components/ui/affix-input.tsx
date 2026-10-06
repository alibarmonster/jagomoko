"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The frame carries the border, focus ring and states, so the prefix and suffix sit beside the text
 * in a row and can be any length ("$", "/c/", "min") without running into what was typed.
 */
const frame =
  "flex h-10 w-full cursor-text items-center rounded-sm border border-line-strong bg-surface transition duration-(--dur-micro) ease-out " +
  "hover:border-subtle focus-within:border-signal focus-within:hover:border-signal focus-within:ring-2 focus-within:ring-signal-tint " +
  "has-[:disabled]:cursor-default has-[:disabled]:bg-sunken has-[[aria-invalid=true]]:border-danger has-[[aria-invalid=true]]:ring-0";

export interface AffixInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  prefixText?: string;
  suffixText?: string;
  invalid?: boolean;
}

/** An input with a prefix and/or suffix. Use it through `Input` (components/ui/field). */
export const AffixInput = React.forwardRef<HTMLInputElement, AffixInputProps>(function AffixInput(
  { className, prefixText, suffixText, invalid, ...props },
  ref,
) {
  const inner = React.useRef<HTMLInputElement | null>(null);
  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      inner.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  return (
    <div
      className={cn(frame, className)}
      onMouseDown={(e) => {
        // a click on the prefix or suffix still puts the caret in the field
        if (e.target !== inner.current && !inner.current?.disabled) {
          e.preventDefault();
          inner.current?.focus();
        }
      }}
    >
      {prefixText ? <span className="shrink-0 select-none pl-3 font-mono text-sm text-subtle">{prefixText}</span> : null}
      <input
        ref={setRefs}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-subtle focus:outline-none disabled:text-faint",
          prefixText ? "pl-0.5" : "pl-3",
          suffixText ? "pr-2" : "pr-3",
        )}
        {...props}
      />
      {suffixText ? <span className="shrink-0 select-none pr-3 font-mono text-xs text-subtle">{suffixText}</span> : null}
    </div>
  );
});
