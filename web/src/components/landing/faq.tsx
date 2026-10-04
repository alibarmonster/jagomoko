import * as React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Section } from "./section";

export const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Do I need crypto to play?",
    a: "No. You sign in with your email and we create your account behind the scenes. There's no wallet to install, no seed phrase and no network fee to think about. While jagomoko is on a test network, we add practice gold to your account for free.",
  },
  {
    q: "Where does my money go when I back a quest?",
    a: "Into escrow, held by the quest's rules until the result is in. If the creator completes it, the pool goes to their vault and splits the way they've set it (always with at least 2% for the community). If they miss it, you get 90% back and 10% goes to the community treasury. If nobody can call it, you get everything back.",
  },
  {
    q: "What happens if the streamer lies about finishing?",
    a: "They have to post proof, and then there's a challenge window. Any backer can dispute it, and a jury of Judges who didn't back the quest votes on what happened. The majority decides. A tie voids the quest and everyone is refunded in full.",
  },
  {
    q: "Can the streamer bet on themselves?",
    a: "No. The creator and their moderators are blocked from taking a side in their own battles, and picks close the moment the match starts.",
  },
  {
    q: "What is XP for?",
    a: "XP is your level, your jury eligibility and your voice in the community treasury (votes are weighted by the square root of your XP, so no one can dominate). You earn it by taking part. It can't be bought or transferred.",
  },
  {
    q: "How do Judges get chosen?",
    a: "Judges at level 5 or higher can join the pool. For each disputed result, a few are picked at random, skipping anyone with a stake in it. On the test network the randomness comes from block data, which is fine for a demo and will move to verifiable randomness before real money is involved.",
  },
  {
    q: "Is this real money?",
    a: "Not yet. jagomoko currently runs on the Monad test network with practice gold, so nothing you do here costs or earns real money. We'll say so clearly, everywhere money appears, until that changes.",
  },
  {
    q: "How do I add the overlay to OBS?",
    a: "In the creator studio, open Overlay and copy your URL. In OBS, add a Browser source, paste the URL and set the size to 1920×1080. The page has a transparent background, so it sits cleanly over your game.",
  },
];

export function Faq() {
  return (
    <Section id="faq" eyebrow="Questions" title="Frequently asked questions">
      <div data-rise className="max-w-[56rem]">
        <Accordion type="single" collapsible className="border-t border-line">
          {FAQS.map((f, i) => (
            <AccordionItem key={f.q} value={`q${i}`}>
              <AccordionTrigger>{f.q}</AccordionTrigger>
              <AccordionContent>{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
