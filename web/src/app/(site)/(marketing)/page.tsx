import { BattlesSection } from "@/components/landing/battles-section";
import { BuiltFor } from "@/components/landing/built-for";
import { Charter } from "@/components/landing/charter";
import { Faq } from "@/components/landing/faq";
import { FairByDesign } from "@/components/landing/fair-by-design";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingMotion } from "@/components/landing/landing-motion";
import { LiveNumbersSection } from "@/components/landing/live-numbers-section";
import { PlatformStrip } from "@/components/landing/platform-strip";
import { QuestsSection } from "@/components/landing/quests-section";
import { SignedInRouter } from "@/components/landing/signed-in-router";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { WhySection } from "@/components/landing/why-section";

export default function LandingPage() {
  return (
    <div data-motion>
      <SiteHeader />
      <main id="main">
        <Hero />
        <PlatformStrip />
        <WhySection />
        <HowItWorks />
        <QuestsSection />
        <BattlesSection />
        <BuiltFor />
        <Charter />
        <FairByDesign />
        <LiveNumbersSection />
        <Faq />
      </main>
      <FinalCta />
      <SiteFooter />
      <LandingMotion />
      <SignedInRouter />
    </div>
  );
}
