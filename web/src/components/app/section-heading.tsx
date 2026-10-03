import * as React from "react";
import { cn } from "@/lib/cn";

export function SectionHeading({
  title,
  meta,
  action,
  id,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-4", className)}>
      <h2 id={id} className="text-lg text-ink">
        {title}
      </h2>
      <div className="flex items-baseline gap-3">
        {meta ? <span className="font-mono text-2xs text-subtle">{meta}</span> : null}
        {action}
      </div>
    </div>
  );
}
