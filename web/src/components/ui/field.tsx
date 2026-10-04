import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { AffixInput } from "./affix-input";

export const inputBase =
  "w-full rounded-sm border border-line-strong bg-surface text-sm text-ink placeholder:text-subtle transition duration-(--dur-micro) ease-out " +
  "hover:border-subtle focus-visible:border-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-tint " +
  "disabled:bg-sunken disabled:text-faint aria-[invalid=true]:border-danger aria-[invalid=true]:ring-0";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-ink", className)} {...props} />;
}

export function FieldHint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1.5 text-xs text-subtle", className)} {...props} />;
}

export function FieldError({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("mt-1.5 flex items-start gap-1.5 text-xs text-danger", className)} {...props}>
      <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  prefixText?: string;
  suffixText?: string;
  invalid?: boolean;
}

// No hooks here, so server pages (like /design) can render it; the affixed version is a client component.
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, prefixText, suffixText, invalid, ...props },
  ref,
) {
  if (!prefixText && !suffixText) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputBase, "h-10 px-3", className)} {...props} />;
  }
  return <AffixInput ref={ref} className={className} prefixText={prefixText} suffixText={suffixText} invalid={invalid} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(inputBase, "min-h-24 resize-y px-3 py-2.5", className)}
        {...props}
      />
    );
  },
);

/** A labelled field with hint and error wired up via aria-describedby. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  counter,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor: string;
  counter?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {counter ? <span className="mb-1.5 font-mono text-2xs text-subtle tnum">{counter}</span> : null}
      </div>
      {children}
      {error ? <FieldError id={`${htmlFor}-error`}>{error}</FieldError> : hint ? <FieldHint id={`${htmlFor}-hint`}>{hint}</FieldHint> : null}
    </div>
  );
}
