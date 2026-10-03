import * as React from "react";
import { challengeQuest, marketingBackers, marketingSplit } from "@/lib/data/marketing";
import { usd } from "@/lib/money";
import { OutcomeTable } from "@/components/app/outcome-table";
import { QuestCard } from "@/components/app/quest-card";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Marker } from "@/components/ui/status-pill";
import { Section } from "./section";
import { FitBox } from "./fit-box";
import { SampleFigure } from "./sample-figure";

const STATES = [
  { title: "Open", text: "Viewers back the quest. The pool grows while the clock runs." },
  { title: "Reported", text: "The creator posts the result with a proof link, like a VOD timestamp." },
  { title: "Challenge window", text: "Backers get a few minutes to dispute it. A dispute goes to a jury." },
  { title: "Resolved", text: "Complete, failed or void. Every outcome is paid out by the rules, not by anyone's say-so." },
] as const;

export function QuestsSection() {
  return (
    <Section
      id="quests"
      eyebrow="Quests"
      title="Back the challenge. Get 90% back if they miss."
      aside="A quest is a crowdfunded stream challenge, like “beat the boss in under an hour.” Your money waits in escrow until the result is in."
    >
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-9">
        <div className="lg:col-span-5">
          <ol className="relative" data-rise>
            {STATES.map((s, i) => (
              <li key={s.title} className="relative flex gap-4 pb-7 last:pb-0">
                {i < STATES.length - 1 ? <span className="absolute bottom-0 left-[11px] top-7 w-px bg-line" aria-hidden /> : null}
                <span
                  className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-canvas"
                  aria-hidden
                >
                  <Marker n={i + 1} className="text-[9px] text-subtle" />
                </span>
                <div>
                  <h3 className="text-sm font-medium text-ink">{s.title}</h3>
                  <p className="mt-0.5 max-w-[40ch] text-sm text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10" data-rise>
            <p className="mb-2 text-sm font-medium text-ink">What happens to your $10</p>
            <OutcomeTable amount={usd(10)} split={marketingSplit} creatorName="the creator" />
            <p className="mt-2 font-mono text-2xs text-subtle">Shown with the sample 80 / 15 / 5 split.</p>
          </div>
        </div>

        <div className="lg:col-span-7" data-rise>
          <PhotoFrame scene="desk" label="Sample stream" className="aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[480px]">
            <SampleFigure
              description="A sample quest in its challenge window: the creator reported it complete and backers have a few minutes to dispute."
              className="absolute inset-0"
            >
              <FitBox width={420} inset="inset-x-4 top-4 bottom-12 sm:inset-x-8 sm:top-8">
                <div className="w-full shadow-lg">
                  <QuestCard quest={challengeQuest} split={marketingSplit} creatorName="NeonBlade" backers={marketingBackers} sample frozenSeconds={372} />
                </div>
              </FitBox>
            </SampleFigure>
          </PhotoFrame>
        </div>
      </div>
    </Section>
  );
}
