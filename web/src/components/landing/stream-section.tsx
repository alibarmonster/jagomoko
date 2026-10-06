import * as React from "react";
import { heroBattle, heroQuest } from "@/lib/data/marketing";
import { SCENES } from "@/lib/domain/mascots";
import { OverlayStage } from "@/components/overlay/overlay-stage";
import { ScaledCanvas } from "@/components/overlay/scaled-canvas";
import { Section } from "./section";

const scene = (name: "stream" | "facecam") => ({
  src: `/scenes/${name}-${SCENES[name].widths.at(-1)}.webp`,
  srcSet: SCENES[name].widths.map((w) => `/scenes/${name}-${w}.webp ${w}w`).join(", "),
});

const TIERS = [
  { amount: "Under $5", text: "The tipper’s own character peeks over the alert." },
  { amount: "$5 to $24", text: "It hops out and cheers, with a few sparkles." },
  { amount: "$25 and up", text: "A party: confetti and a violet frame, held for 9 seconds." },
] as const;

/**
 * What the creator's audience actually sees: a sample game stream with the facecam, and the real
 * overlay component on top of it (the same one OBS loads), cycling sample alerts.
 */
export function StreamSection() {
  const stream = scene("stream");
  const facecam = scene("facecam");
  return (
    <Section
      id="stream"
      eyebrow="Drops into your stream"
      title="Every tip shows up on stream"
      aside="The overlay is a browser source in OBS. When someone tips, their own character pops up with the alert, so the whole chat sees who backed the run."
    >
      <figure data-rise>
        <div className="relative overflow-hidden rounded-md border border-line bg-sunken">
          <ScaledCanvas>
            {/* eslint-disable-next-line @next/next/no-img-element -- the backdrop of a fixed 1920x1080 canvas */}
            <img src={stream.src} srcSet={stream.srcSet} sizes="(min-width: 1280px) 1216px, 100vw" alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
            {/* eslint-disable-next-line @next/next/no-img-element -- the streamer's facecam, in the corner like on a real stream */}
            <img
              src={facecam.src}
              srcSet={facecam.srcSet}
              sizes="420px"
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute right-12 top-12 w-[420px] rounded-2xl border-[6px] border-white/25 shadow-2xl"
            />
            <OverlayStage quest={heroQuest} battle={heroBattle} demo />
          </ScaledCanvas>
          <span className="absolute bottom-3 right-3 rounded-xs bg-ink/55 px-2 py-1 font-mono text-2xs text-on-inverse backdrop-blur-sm">Sample stream</span>
        </div>
        <figcaption className="sr-only">
          A sample game stream with the streamer&rsquo;s facecam in the corner and the jagomoko overlay: tip alerts, a prediction battle and a quest tracker.
        </figcaption>
      </figure>
      <ul className="mt-6 grid gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-3" data-rise>
        {TIERS.map((t) => (
          <li key={t.amount} className="bg-canvas p-4 md:p-5">
            <p className="font-mono text-xs text-ink">{t.amount}</p>
            <p className="mt-1 text-sm text-muted">{t.text}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
