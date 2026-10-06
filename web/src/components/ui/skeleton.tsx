import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** Static sunken block with a soft opacity pulse — no shimmer sweep. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse-soft rounded-xs bg-sunken", className)} aria-hidden {...props} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-md border border-dashed border-line-strong px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-3 text-faint">{icon}</div> : null}
      <p className="text-base text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-[40ch] text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
