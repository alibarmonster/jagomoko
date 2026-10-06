import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Wraps a real product component shown as a labelled marketing sample. It is
 * inert (not focusable, not clickable) and hidden from assistive tech, with a
 * plain-text description instead — the sample is illustration, not content.
 */
export function SampleFigure({
  description,
  children,
  className,
  ...rest
}: {
  description: string;
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <figure className={cn("relative", className)} {...rest}>
      <div inert aria-hidden="true">
        {children}
      </div>
      <figcaption className="sr-only">{description}</figcaption>
    </figure>
  );
}
