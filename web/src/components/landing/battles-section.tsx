import * as React from "react";
import { Check } from "lucide-react";
import { heroBattle } from "@/lib/data/marketing";
import { BattleCard } from "@/components/app/battle-card";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Mascot } from "@/components/ui/mascot";
import { Section } from "./section";
import { FitBox } from "./fit-box";
import { SampleFigure } from "./sample-figure";

const POINTS = [
  "The streamer and their mods can't play their own battles.",
  "Picks close the moment the match starts.",
  "No house: 98% of the losing side goes to the winners, 2% to the community treasury.",
] as const;

export function BattlesSection() {
  return (
    <Section
      id="battles"
      eyebrow="Battles"
      title="Call the match. Winners split the other side."
      aside="Battles are viewer versus viewer: will the streamer win this round? Pick a side before it starts. Nobody takes a cut but the community."
    >
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-9">
        <div className="order-2 lg:order-1 lg:col-span-7" data-rise>
          <PhotoFrame scene="couch" label="Sample stream" className="aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[440px]">
            <SampleFigure
              description="A sample battle: will the streamer win this Valorant match? 14 players picked Win with $182, 8 picked Lose with $96."
              className="absolute inset-0"
            >
              <FitBox width={420} inset="inset-x-4 top-4 bottom-12 sm:inset-x-8 sm:top-8">
                <div className="relative w-full pt-12">
                  <Mascot name="seer-peek" height={60} className="absolute left-10 top-0 z-10" />
                  <div className="shadow-lg">
                  <BattleCard battle={heroBattle} sample frozenSeconds={278} />
                  </div>
                </div>
              </FitBox>
            </SampleFigure>
          </PhotoFrame>
        </div>

        <div className="order-1 lg:order-2 lg:col-span-5">
          <ul className="space-y-4" data-rise>
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3 text-base text-ink">
                <span className="mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-ink text-canvas" aria-hidden>
                  <Check className="size-3" strokeWidth={2.5} />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-md border border-line bg-sunken p-4" data-rise>
            <p className="text-sm font-medium text-ink">Prefer no money?</p>
            <p className="mt-1 text-sm text-muted">
              Points mode is free to play and pays XP only. Creators choose it per battle, and it&rsquo;s the easiest way to try the game.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
