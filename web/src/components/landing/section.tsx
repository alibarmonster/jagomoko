import * as React from "react";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/cn";

/**
 * Landing section header pattern (DESIGN.md §5): a full-bleed hairline, an
 * eyebrow, an H2 on cols 1–5 and a supporting paragraph on cols 7–12.
 */
export function Section({
  id,
  eyebrow,
  title,
  aside,
  children,
  className,
  innerClassName,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={titleId} className={cn("border-t border-line", className)}>
      <div className={cn("container-page py-14 md:py-20 lg:py-28", innerClassName)}>
        <header className="grid grid-cols-12 gap-x-4 gap-y-4 md:gap-x-6 lg:gap-x-9">
          <div className="col-span-12 lg:col-span-6">
            <p className="text-lg text-muted" data-rise>
              {eyebrow}
            </p>
            <Reveal as="h2" id={titleId} className="mt-3 text-2xl lg:text-3xl">
              {title}
            </Reveal>
          </div>
          {aside ? (
            <div className="col-span-12 text-base text-muted lg:col-span-5 lg:col-start-8 lg:pt-9" data-rise>
              {aside}
            </div>
          ) : null}
        </header>
        {children ? <div className="mt-10 md:mt-14">{children}</div> : null}
      </div>
    </section>
  );
}
