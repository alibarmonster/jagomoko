import * as React from "react";
import type { MascotName } from "@/lib/mascots";
import { Mascot } from "@/components/ui/mascot";
import { Marker } from "@/components/ui/status-pill";
import { Section } from "./section";

const STEPS = [
  {
    sticker: "moko-hello",
    title: "Character",
    text: "Create a character with a role. XP is earned by playing, never bought, and it follows you to every guild.",
  },
  {
    sticker: "knight-cheer",
    title: "Quests",
    text: "Back a stream challenge. If it's completed, the pool goes to the creator. If it's missed, you get 90% back.",
  },
  {
    sticker: "seer-cheer",
    title: "Battles",
    text: "Pick a side on the match. Winners split the losing side. There is no house.",
  },
  {
    sticker: "moko-party",
    title: "Split vault",
    text: "Every dollar is divided the moment it arrives — creator, treasury, community fund — and the split is public.",
  },
  {
    sticker: "judge-idle",
    title: "Jury",
    text: "If a result is disputed, Judges with nothing at stake decide. Honest votes earn XP. Dishonest ones cost it.",
  },
  {
    sticker: "bard-cheer",
    title: "Treasury",
    text: "Everyone with XP votes on how the community treasury is spent. Square-root weighting keeps whales in check.",
  },
] as const satisfies readonly { sticker: MascotName; title: string; text: string }[];

/** A 3×2 hairline grid (gap-px on a line-colored field): no card fills, just structure and 01–06 markers. */
export function HowItWorks() {
  return (
    <Section
      id="how"
      eyebrow="How it works"
      title="From first tip to treasury, nothing to explain"
      aside="Six small systems that fit together. A viewer can use one or all of them, and the creator never has to run a spreadsheet."
    >
      <ol className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3" data-rise>
        {STEPS.map((s, i) => {
          return (
            <li key={s.title} className="relative bg-canvas p-5 md:p-6">
              <Marker n={i + 1} className="absolute right-5 top-5 md:right-6 md:top-6" />
              <Mascot name={s.sticker} height={56} />
              <h3 className="mt-5 text-sm font-medium text-ink md:mt-6">{s.title}</h3>
              <p className="mt-1.5 max-w-[38ch] text-sm text-muted">{s.text}</p>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
