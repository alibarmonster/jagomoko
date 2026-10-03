import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { REPO_URL } from "@/lib/config";
import { Marker } from "@/components/ui/status-pill";
import { Section } from "./section";

const RULES = [
  {
    title: "Creators can’t play their own battles.",
    text: "The contract blocks the creator and their moderators from taking a side.",
    file: "PredictionBattle.sol",
  },
  {
    title: "Every split is public.",
    text: "Each dollar’s route — creator, treasury, community — is recorded for everyone to see.",
    file: "SplitVault.sol",
  },
  {
    title: "Disputes go to Judges with nothing at stake.",
    text: "Anyone who backed a quest is excluded from its jury. Honest Judges earn XP, dishonest ones lose it.",
    file: "Jury.sol",
  },
  {
    title: "Refunds are always claimable.",
    text: "Even if a creator disappears, backers can settle a stale quest and claim their money back themselves.",
    file: "QuestEscrow.sol",
  },
] as const;

export function FairByDesign() {
  return (
    <Section
      id="fair"
      eyebrow="Fair by design"
      title="Rules nobody can bend, including us"
      aside="These rules are enforced by smart contracts on Monad, not by our say-so. The code is written to be read."
    >
      <ul className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4" data-rise>
        {RULES.map((r, i) => (
          <li key={r.file} className="flex flex-col bg-canvas p-5 md:p-6">
            <Marker n={i + 1} />
            <h3 className="mt-6 text-base text-ink">{r.title}</h3>
            <p className="mt-2 flex-1 text-sm text-muted">{r.text}</p>
            <a
              href={`${REPO_URL}/blob/main/contracts/src/${r.file}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1 self-start rounded-xs font-mono text-xs text-ink underline decoration-line-strong underline-offset-4 transition hover:decoration-ink"
            >
              Read the rule
              <ArrowUpRight className="size-3" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-4 font-mono text-2xs text-subtle" data-rise>
        Links go to the contract source. They&rsquo;ll point at the verified deployment on the Monad explorer once we launch.
      </p>
    </Section>
  );
}
