import * as React from "react";
import { alice, juryCase, marketingSplit } from "@/lib/data/marketing";
import { formatUsd, usd } from "@/lib/money";
import { CharacterCard } from "@/components/app/character-card";
import { JuryCaseCard } from "@/components/app/jury-case-card";
import { PhotoFrame, type Scene } from "@/components/ui/photo-frame";
import { Mascot } from "@/components/ui/mascot";
import { LiveMascot } from "@/components/ui/live-mascot";
import { SplitBar } from "@/components/ui/progress";
import { Section } from "./section";
import { FitBox } from "./fit-box";
import { SampleFigure } from "./sample-figure";

function Trio({
  scene,
  title,
  text,
  description,
  width,
  mascot,
  children,
}: {
  scene: Scene;
  title: string;
  text: string;
  description: string;
  width: number;
  /** a cast member standing in the scene */
  mascot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article data-rise>
      <PhotoFrame scene={scene} label="Sample stream" className="aspect-[4/3]">
        <SampleFigure description={description} className="absolute inset-0">
          <FitBox width={width} inset="inset-x-4 top-4 bottom-11">
            {children}
          </FitBox>
        </SampleFigure>
        {mascot}
      </PhotoFrame>
      <h3 className="mt-5 text-lg text-ink">{title}</h3>
      <p className="mt-1.5 max-w-[40ch] text-sm text-muted">{text}</p>
    </article>
  );
}

export function WhySection() {
  return (
    <Section
      id="why"
      eyebrow="Why jagomoko?"
      title="Your viewers already play along. Now it counts."
      aside="Chat already predicts, dares and cheers, but none of it sticks. jagomoko gives every viewer a character that remembers, and every dollar a route the whole community can see."
    >
      <div className="grid gap-10 md:grid-cols-3 md:gap-6 lg:gap-9">
        <Trio
          scene="couch"
          title="One character, every stream."
          text="Pick a role, earn XP by taking part, and carry your level to every creator's guild. XP can't be bought or transferred."
          description="A sample character card: Alice, a level 7 Knight."
          width={260}
          mascot={<LiveMascot name="knight-wave" height={124} idle="wave" wrapperClassName="absolute bottom-3 right-3 z-20 hidden sm:block" />}
        >
          <CharacterCard name={alice.name} role={alice.role} xp={alice.xp} address={alice.id} number={42} compact className="max-w-none shadow-md" />
        </Trio>

        <Trio
          scene="desk"
          title="Money that splits itself."
          text="Tips and quest pools are divided the moment they arrive: creator, community treasury, community fund. Nobody has to trust a spreadsheet."
          description="A sample $10 tip split $9.80 to the creator, $0.10 to the treasury and $0.10 to the community."
          width={280}
          mascot={<LiveMascot name="moko-party" height={112} wrapperClassName="absolute bottom-3 right-3 z-20 hidden sm:block" />}
        >
          <div className="w-full rounded-md bg-surface p-4 shadow-md">
            <p className="text-xs text-subtle">You tip</p>
            <p className="font-mono text-2xl text-ink tnum">{formatUsd(usd(10), { cents: "always" })}</p>
            <div className="mt-3">
              <SplitBar split={marketingSplit} amount={usd(10)} />
            </div>
          </div>
        </Trio>

        <Trio
          scene="crowd"
          title="Fair calls, settled by the crowd."
          text="If a result is disputed, Judges with nothing at stake vote. The majority wins, and honest Judges earn XP."
          description="A sample jury case: two Judges have voted on whether a no-death Water Temple run really happened."
          width={320}
        >
          <div className="relative w-full pt-11">
            <Mascot name="judge-peek" height={52} className="absolute left-1/2 top-0 z-10 -translate-x-1/2" />
            <JuryCaseCard item={juryCase} sample className="w-full shadow-md" />
          </div>
        </Trio>
      </div>
    </Section>
  );
}
