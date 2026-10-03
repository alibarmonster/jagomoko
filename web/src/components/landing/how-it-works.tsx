import * as React from "react";
import { Flag, Landmark, Scale, Split, Swords, User } from "lucide-react";
import { Marker } from "@/components/ui/status-pill";
import { Section } from "./section";

const STEPS = [
  {
    icon: User,
    title: "Character",
    text: "Create a character with a role. XP is earned by playing, never bought, and it follows you to every realm.",
  },
  {
    icon: Flag,
    title: "Quests",
    text: "Back a stream challenge. If it's completed, the pool goes to the creator. If it's missed, you get 90% back.",
  },
  {
    icon: Swords,
    title: "Battles",
    text: "Pick a side on the match. Winners split the losing side. There is no house.",
  },
  {
    icon: Split,
    title: "Split vault",
    text: "Every dollar is divided the moment it arrives — creator, treasury, community pool — and the split is public.",
  },
  {
    icon: Scale,
    title: "Jury",
    text: "If a result is disputed, Judges with nothing at stake decide. Honest votes earn XP. Dishonest ones cost it.",
  },
  {
    icon: Landmark,
    title: "Treasury",
    text: "Everyone with XP votes on how the community treasury is spent. Square-root weighting keeps whales in check.",
  },
] as const;

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
          const Icon = s.icon;
          return (
            <li key={s.title} className="relative bg-canvas p-5 md:p-6">
              <Marker n={i + 1} className="absolute right-5 top-5 md:right-6 md:top-6" />
              <Icon className="size-6 text-ink" aria-hidden strokeWidth={1.5} />
              <h3 className="mt-8 text-sm font-medium text-ink md:mt-10">{s.title}</h3>
              <p className="mt-1.5 max-w-[38ch] text-sm text-muted">{s.text}</p>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
