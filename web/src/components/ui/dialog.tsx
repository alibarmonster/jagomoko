"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Bottom sheet on mobile, centered dialog from md up. Radix handles focus
 * trapping, Escape, scroll lock and returning focus to the trigger.
 */
export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean; width?: "sm" | "md" | "lg" }
>(function DialogContent({ className, children, hideClose, width = "md", ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 animate-fade-in data-[state=closed]:animate-fade-out" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-50 flex max-h-[92dvh] flex-col overflow-hidden bg-surface shadow-lg outline-none",
          // mobile sheet
          "inset-x-0 bottom-0 rounded-t-lg animate-sheet-in data-[state=closed]:animate-sheet-out",
          // desktop dialog
          "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[calc(100%-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:animate-dialog-in md:data-[state=closed]:animate-dialog-out",
          width === "sm" && "md:max-w-[400px]",
          width === "md" && "md:max-w-[460px]",
          width === "lg" && "md:max-w-[620px]",
          className,
        )}
        {...props}
      >
        <span className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line-strong md:hidden" aria-hidden />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:p-6">{children}</div>
        {hideClose ? null : (
          <DialogPrimitive.Close
            className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-sm text-subtle transition hover:bg-sunken hover:text-ink md:right-4 md:top-4"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 pr-8", className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return <DialogPrimitive.Title ref={ref} className={cn("text-xl text-ink", className)} {...props} />;
});

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn("mt-1.5 text-sm text-muted", className)} {...props} />;
});
