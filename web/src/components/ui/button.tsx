import * as React from "react";
import Link from "next/link";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium",
    "transition duration-(--dur-micro) ease-out active:scale-[0.98]",
    "disabled:pointer-events-none aria-disabled:pointer-events-none",
    "[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: "bg-ink text-canvas hover:bg-ink-2 disabled:bg-sunken disabled:text-faint aria-disabled:bg-sunken aria-disabled:text-faint",
        secondary:
          "border border-line-strong bg-surface text-ink hover:bg-sunken disabled:bg-sunken disabled:text-faint aria-disabled:text-faint",
        ghost: "text-ink hover:bg-sunken disabled:text-faint",
        signal: "bg-signal text-white hover:bg-signal-hover disabled:bg-sunken disabled:text-faint",
        inverse: "bg-canvas text-ink hover:bg-white disabled:opacity-60",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-base",
        "icon-sm": "size-8 text-sm",
        icon: "size-10 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner, keeps the label and locks the width. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, loading = false, disabled, children, type, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {children}
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
    </button>
  );
});

export interface ButtonLinkProps
  extends Omit<React.ComponentProps<typeof Link>, "className">,
    VariantProps<typeof buttonVariants> {
  className?: string;
}

export function ButtonLink({ className, variant, size, ...props }: ButtonLinkProps) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
