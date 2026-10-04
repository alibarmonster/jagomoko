import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** A link out to the block explorer, opening in a new tab. */
export function ExplorerLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xs underline decoration-line-strong underline-offset-2 transition hover:text-ink",
        className,
      )}
    >
      {children}
      <ArrowUpRight className="size-3" aria-hidden />
    </a>
  );
}
