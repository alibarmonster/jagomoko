import * as React from "react";
import { Reveal } from "@/components/ui/reveal";

/**
 * Replaces a customer testimonial: no invented quotes. Swap in a real creator
 * quote (with permission and a name) once one exists.
 */
export function Charter() {
  return (
    <section aria-label="Charter" className="border-t border-line">
      <figure className="container-page flex flex-col items-center py-20 text-center md:py-28 lg:py-36">
        <blockquote>
          <Reveal as="p" className="mx-auto max-w-[22ch] text-3xl">
            Of the community, by the community, for the community.
          </Reveal>
        </blockquote>
        <figcaption className="mt-6 font-mono text-2xs text-subtle" data-rise>
          &mdash; the jagomoko charter
        </figcaption>
      </figure>
    </section>
  );
}
