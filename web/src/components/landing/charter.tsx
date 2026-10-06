import * as React from "react";
import { Reveal } from "@/components/ui/reveal";
import { SCENES } from "@/lib/domain/mascots";

const BANNER = {
  src: `/scenes/banner-${SCENES.banner.widths[0]}.webp`,
  srcSet: SCENES.banner.widths.map((w) => `/scenes/banner-${w}.webp ${w}w`).join(", "),
};

/**
 * Replaces a customer testimonial: no invented quotes. Swap in a real creator
 * quote (with permission and a name) once one exists.
 */
export function Charter() {
  return (
    <section aria-label="Charter" className="border-t border-line">
      <figure className="container-page flex flex-col items-center py-16 text-center md:py-20">
        <blockquote>
          <Reveal as="p" className="mx-auto max-w-[22ch] text-3xl">
            Of the community, by the community, for the community.
          </Reveal>
        </blockquote>
        <div className="mt-8 w-full overflow-hidden rounded-md md:mt-10" data-rise>
          {/* eslint-disable-next-line @next/next/no-img-element -- art that is one fixed band */}
          <img
            src={BANNER.src}
            srcSet={BANNER.srcSet}
            sizes="(min-width: 1280px) 1216px, 100vw"
            width={SCENES.banner.width}
            height={SCENES.banner.height}
            alt="The cast of jagomoko on a hill: a Knight, a Seer, Moko, a Judge and a Bard."
            loading="lazy"
            decoding="async"
            className="aspect-[3/1] w-full object-cover object-[center_65%] md:aspect-[6/1]"
          />
        </div>
      </figure>
    </section>
  );
}
