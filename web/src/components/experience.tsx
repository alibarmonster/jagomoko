"use client";

import * as React from "react";
import { RadioGroup } from "radix-ui";
import { cn } from "@/lib/utils/cn";
import { DEFAULT_EXPERIENCE, EXPERIENCES, getExperience, isExperience, setExperience, subscribeExperience, type Experience } from "@/lib/experience";
import { useToast } from "@/components/ui/toast";

/** The experience this browser chose (lib/experience.ts). The server renders the default. */
export function useExperience(): Experience {
  return React.useSyncExternalStore(subscribeExperience, getExperience, () => DEFAULT_EXPERIENCE);
}

/** True when the screens show the on-chain receipts. */
export function useWeb3(): boolean {
  return useExperience() === "web3";
}

/** Renders its children in web3 only: explorer links, addresses, contracts and chains. */
export function Web3Only({ children }: { children: React.ReactNode }) {
  return useWeb3() ? <>{children}</> : null;
}

export const EXPERIENCE_LABEL: Record<Experience, string> = { web2: "Web2", web3: "Web3" };

export const EXPERIENCE_HINT: Record<Experience, string> = {
  web2: "Works like any app. The blockchain runs in the background.",
  web3: "Shows the receipts: transactions, accounts and contracts on Monad.",
};

/** Switches the experience and says what changed. */
export function useChooseExperience() {
  const { push } = useToast();
  return React.useCallback(
    (next: Experience) => {
      if (next === getExperience()) return;
      setExperience(next);
      push(
        next === "web3"
          ? { title: "Web3 mode", description: "Transactions, accounts and contracts now show, with links to Monadscan." }
          : { title: "Web2 mode", description: "It works like any app. Everything still runs on Monad in the background." },
      );
    },
    [push],
  );
}

/** The Web2 / Web3 switch: a two-option radio group. */
export function ExperienceToggle({ className }: { className?: string }) {
  const experience = useExperience();
  const choose = useChooseExperience();
  return (
    <RadioGroup.Root
      value={experience}
      onValueChange={(v) => isExperience(v) && choose(v)}
      orientation="horizontal"
      aria-label="Experience"
      className={cn("inline-flex h-8 items-center rounded-full border border-line bg-surface p-0.5", className)}
    >
      {EXPERIENCES.map((e) => (
        <RadioGroup.Item
          key={e}
          value={e}
          title={EXPERIENCE_HINT[e]}
          className="h-full rounded-full px-3 font-mono text-2xs font-medium text-subtle transition-colors duration-(--dur-micro) hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal data-[state=checked]:bg-ink data-[state=checked]:text-canvas"
        >
          {EXPERIENCE_LABEL[e]}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

/** The switch with a sentence on each option, for the "Me" page. */
export function ExperienceCard({ className }: { className?: string }) {
  const experience = useExperience();
  return (
    <div className={cn("rounded-md border border-line bg-surface p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">Experience</p>
        <ExperienceToggle />
      </div>
      <p className="mt-2 text-sm text-muted">{EXPERIENCE_HINT[experience]}</p>
    </div>
  );
}
