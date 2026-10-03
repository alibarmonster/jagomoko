"use client";

import * as React from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motionOff } from "@/lib/motion";

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Landing choreography (DESIGN.md §8.1). One hero beat sheet, masked word
 * reveals on section headlines, and a calm fade-and-rise for blocks — all once,
 * all transform/opacity, nothing pinned or scroll-jacked. Reduced motion renders
 * the settled page: this component simply does nothing.
 */
export function LandingMotion() {
  useIsoLayoutEffect(() => {
    if (motionOff()) {
      document.querySelector("[data-motion]")?.removeAttribute("data-motion");
      return;
    }
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // ---- hero: frame -> headline -> subhead + CTA -> panels -> toast
      const hero = gsap.timeline({ defaults: { ease: "power3.out" } });
      hero
        .fromTo("[data-hero='frame']", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6 }, 0)
        .fromTo("[data-hero-words] .word", { yPercent: 110, opacity: 1 }, { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.035 }, 0.15)
        .fromTo("[data-hero='note']", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, 0.1)
        .fromTo("[data-hero='sub'], [data-hero='cta']", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.55, stagger: 0.08 }, 0.5)
        .fromTo("[data-hero='panel']", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.65 }, 0.65)
        .fromTo("[data-hero='toast']", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, 1.6);

      // ---- section headlines: masked word reveal, once
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        const words = el.querySelectorAll(".word");
        gsap.set(words, { yPercent: 110 });
        gsap.to(words, {
          yPercent: 0,
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.035,
          scrollTrigger: { trigger: el, start: "top 82%", once: true },
        });
      });

      // ---- blocks: fade + rise, batched so siblings stagger 50ms
      gsap.set("[data-rise]", { opacity: 0, y: 16 });
      ScrollTrigger.batch("[data-rise]", {
        start: "top 88%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out", stagger: 0.05, overwrite: true }),
      });
    });

    // fonts shift line breaks; measure again once they are in
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => ctx.revert();
  }, []);

  return null;
}
