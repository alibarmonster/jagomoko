"use client";

import * as React from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const Accordion = AccordionPrimitive.Root;

export const AccordionItem = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return <AccordionPrimitive.Item ref={ref} className={cn("border-b border-line", className)} {...props} />;
});

export const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(function AccordionTrigger({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          "group flex flex-1 items-center justify-between gap-6 py-5 text-left text-lg text-ink transition-colors duration-(--dur-micro) hover:text-ink-2",
          className,
        )}
        {...props}
      >
        {children}
        <span className="relative inline-flex size-6 shrink-0 items-center justify-center text-subtle" aria-hidden>
          <Plus className="size-5 group-data-[state=open]:hidden" />
          <Minus className="hidden size-5 group-data-[state=open]:block" />
        </span>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
});

export const AccordionContent = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn("max-w-[64ch] pb-6 text-base text-muted", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
});
