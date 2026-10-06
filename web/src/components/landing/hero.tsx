import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { alice, heroBattle, heroQuest, marketingBackers, marketingSplit } from "@/lib/data/marketing";
import { formatUsd, usd } from "@/lib/money";
import { routes } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { LevelRing } from "@/components/ui/progress";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Reveal } from "@/components/ui/reveal";
import { LiveDot } from "@/components/ui/status-pill";
import { Mascot } from "@/components/ui/mascot";
import { LiveMascot } from "@/components/ui/live-mascot";
import { AuthDialog } from "@/components/app/auth-dialog";
import { BattleCard } from "@/components/app/battle-card";
import { QuestCard } from "@/components/app/quest-card";
import { FitBox } from "./fit-box";
import { SampleFigure } from "./sample-figure";
import { HeroToast } from "./hero-toast";

/**
 * Split hero: the value proposition on the left, a real product composite on
 * the right — the stream hub, with a quest and a battle in flight.
 */
export function Hero() {
  return (
    <section aria-label="Introduction" className="relative">
      <div className="grid lg:min-h-[min(calc(100svh-var(--header-h)),880px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col justify-center px-4 py-14 md:px-6 lg:border-r lg:border-line lg:py-20 lg:pl-[max(2.5rem,calc((100vw-1500px)/2+2.5rem))] lg:pr-14">
          <p data-hero="note" className="text-sm text-muted">
            <Link href="#fair" className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-ink">
              Live on Monad testnet
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </p>

          <Reveal as="h1" hero className="mt-6 max-w-[14ch] text-4xl">
            Turn your stream into a co-op game
          </Reveal>

          <p data-hero="sub" className="mt-6 max-w-[34rem] text-base text-muted">
            Viewers back quests, call the match and level up a character. Every dollar splits instantly between the creator, the
            community and the players.
          </p>

          <div data-hero="cta" className="mt-8">
            <AuthDialog
              trigger={
                <Button size="lg">
                  Create your character
                </Button>
              }
            />
            <p className="mt-3 font-mono text-2xs text-subtle">Sign in with email &middot; No app, no wallet</p>
            <p className="mt-6 text-sm text-muted">
              Streaming?{" "}
              <Link href={routes.studio} className="rounded-xs font-medium text-ink underline decoration-line-strong underline-offset-4 transition hover:decoration-ink">
                See the creator studio
              </Link>
            </p>
          </div>
        </div>

        <div data-hero="frame" className="relative min-h-[560px] lg:min-h-0">
          <PhotoFrame scene="room" label="Sample stream" className="absolute inset-0 rounded-none">
            <SampleFigure
              data-hero="panel"
              description="A sample stream hub: a quest to beat the Ender Dragon in under an hour with $340 backed, and a prediction battle on whether the streamer wins a match."
              className="absolute inset-0"
            >
              <FitBox width={440} inset="inset-x-4 inset-y-10 sm:inset-x-8 lg:left-[8%] lg:right-6" align="start">
                <div className="relative pt-[52px]">
                {/* the Knight peeks over the guild card */}
                <Mascot name="knight-peek" height={64} eager className="absolute right-12 top-0 z-10" />
                <div className="overflow-hidden rounded-md bg-surface shadow-lg">
                  <div className="flex h-11 items-center justify-between border-b border-line px-4">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      <LiveDot /> NeonBlade&rsquo;s guild
                    </span>
                    <span className="flex items-center gap-2">
                      <Avatar name={alice.name} role={alice.role} size={24} />
                      <span className="font-mono text-xs text-ink tnum">{formatUsd(usd(12.4), { cents: "always" })}</span>
                      <LevelRing level={alice.level} progress={0.62} size={24} />
                    </span>
                  </div>
                  <div className="space-y-3 bg-canvas p-3">
                    <QuestCard quest={heroQuest} split={marketingSplit} creatorName="NeonBlade" backers={marketingBackers} sample frozenSeconds={2530} />
                    <BattleCard battle={heroBattle} sample frozenSeconds={278} />
                  </div>
                </div>
                </div>
              </FitBox>
            </SampleFigure>
            <LiveMascot name="seer-wave" height={136} idle="wave" wrapperClassName="absolute right-[4%] top-[34%] z-10 hidden xl:block" />
            <HeroToast />
          </PhotoFrame>
        </div>
      </div>
    </section>
  );
}
