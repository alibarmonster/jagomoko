import * as React from "react";
import { cn } from "@/lib/utils/cn";

type Tag = "h1" | "h2" | "h3" | "p" | "span" | "blockquote";

/**
 * Masked word reveal. The words are split on the server (so the markup is
 * identical on the client), wrapped in an overflow mask, and animated up from
 * below by LandingMotion. Assistive tech reads the full sentence from a
 * visually hidden copy and skips the animated words (aria-hidden), so this
 * works on any element, not only headings. Use for short headlines only.
 */
export function Reveal({
  as: Tag = "h2",
  children,
  className,
  hero = false,
  id,
}: {
  as?: Tag;
  children: string;
  className?: string;
  /** Hero headlines start masked in CSS so nothing flashes before the sequence plays. */
  hero?: boolean;
  id?: string;
}) {
  const words = children.trim().split(/\s+/);
  const props = hero ? { "data-hero-words": "" } : { "data-reveal": "" };
  return (
    <Tag id={id} className={cn("reveal", className)} {...props}>
      <span className="sr-only">{children}</span>
      <span aria-hidden="true">
        {words.map((w, i) => (
          <React.Fragment key={`${w}-${i}`}>
            <span className="word-mask">
              <span className="word">{w}</span>
            </span>
            {i < words.length - 1 ? " " : null}
          </React.Fragment>
        ))}
      </span>
    </Tag>
  );
}
