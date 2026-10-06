import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** Surface + 1px line. Borders first, shadows second (see DESIGN.md §3.5). */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md border border-line bg-surface", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg text-ink", className)} {...props} />;
}

/** Hairline-separated rows of label/value, used for stats lists. */
export function StatList({
  rows,
  className,
}: {
  rows: { label: string; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
          <dt className="text-muted">{r.label}</dt>
          <dd className="font-mono text-ink tnum">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
