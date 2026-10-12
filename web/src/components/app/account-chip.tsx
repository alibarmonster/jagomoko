"use client";

import * as React from "react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { ArrowUpRight, Check, Coins, Copy, LayoutDashboard, LogOut, User } from "lucide-react";
import { EXPLORER, explorerAddress } from "@/lib/chain/config";
import { EXPERIENCES, isExperience } from "@/lib/experience";
import { shortAddress } from "@/lib/utils/format";
import { formatUsd } from "@/lib/utils/money";
import { routes } from "@/lib/routing/routes";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LevelRing } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { PRACTICE_GOLD, useSession } from "@/components/session";
import { EXPERIENCE_LABEL, useChooseExperience, useExperience, Web3Only } from "@/components/experience";
import { usePending } from "@/hooks/use-pending";
import { useSignOut } from "@/hooks/use-sign-out";
import { viewTx } from "@/lib/chain/explorer";
import { AuthDialog } from "./auth-dialog";

const item =
  "flex cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-sunken";

/**
 * Your account's address, and where to find your activity on the explorer. Every move is a
 * sponsored operation the bundler sends for you, so it is listed under token transfers ("Handle
 * Ops"), not as a transaction from your address.
 */
function AccountAddress({ address }: { address: string }) {
  const { push } = useToast();

  function copy() {
    const failed = () => push({ tone: "danger", title: "Couldn’t copy the address" });
    try {
      void navigator.clipboard.writeText(address).then(() => push({ title: "Address copied" }), failed);
    } catch {
      failed();
    }
  }

  return (
    <>
      <DropdownMenu.Separator className="my-1 h-px bg-line" />
      <div className="max-w-[240px] px-2.5 pb-1 pt-1.5">
        <p className="text-2xs text-subtle">Your account</p>
        <p className="font-mono text-xs text-ink">{shortAddress(address)}</p>
        <p className="mt-1 text-2xs text-subtle">Your actions are sent for you, so the explorer lists them as Handle Ops.</p>
      </div>
      <DropdownMenu.Item className={item} onSelect={copy}>
        <Copy className="size-4 text-subtle" aria-hidden /> Copy address
      </DropdownMenu.Item>
      <DropdownMenu.Item asChild className={item}>
        <a href={explorerAddress(address, { tokens: true })} target="_blank" rel="noopener noreferrer">
          <ArrowUpRight className="size-4 text-subtle" aria-hidden /> View on {EXPLORER.name}
        </a>
      </DropdownMenu.Item>
    </>
  );
}

/** Web2 (like any app) or Web3 (the receipts on screen); see lib/experience.ts. */
function ExperienceItems() {
  const experience = useExperience();
  const choose = useChooseExperience();
  return (
    <>
      <DropdownMenu.Separator className="my-1 h-px bg-line" />
      <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-2xs text-subtle">Experience</DropdownMenu.Label>
      <DropdownMenu.RadioGroup value={experience} onValueChange={(v) => isExperience(v) && choose(v)}>
        {EXPERIENCES.map((e) => (
          <DropdownMenu.RadioItem key={e} value={e} className={item}>
            <span className="flex size-4 items-center justify-center" aria-hidden>
              <DropdownMenu.ItemIndicator>
                <Check className="size-4 text-ink" />
              </DropdownMenu.ItemIndicator>
            </span>
            {EXPERIENCE_LABEL[e]}
            <span className="text-2xs text-subtle">{e === "web2" ? "like any app" : "show receipts"}</span>
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.RadioGroup>
    </>
  );
}

/** Avatar + balance + level ring. Anonymous viewers get a single call to action. */
export function AccountChip() {
  const s = useSession();
  const { push } = useToast();
  const { run } = usePending();
  const signOut = useSignOut();

  if (!s.ready) return <div className="h-9 w-32" aria-hidden />;

  if (!s.signedIn) {
    return (
      <AuthDialog
        trigger={
          <Button size="sm">
            Create your character
          </Button>
        }
      />
    );
  }

  // signed in but no character yet (a streamer needs none): a plain account menu
  if (!s.hasCharacter) {
    const who = s.state.email ?? "Your account";
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-9 max-w-[200px] items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm text-ink transition hover:bg-sunken"
            aria-label={`Account menu. ${who}`}
          >
            <span className="truncate">{who}</span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-[220px] animate-fade-in rounded-md bg-surface p-1 shadow-md">
            {s.state.realm ? (
              <DropdownMenu.Item asChild className={item}>
                <Link href={routes.studio}>
                  <LayoutDashboard className="size-4 text-subtle" aria-hidden /> Creator studio
                </Link>
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item asChild className={item}>
                <Link href={routes.studio}>
                  <LayoutDashboard className="size-4 text-subtle" aria-hidden /> Start your guild
                </Link>
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item asChild className={item}>
              <Link href={routes.onboarding}>
                <User className="size-4 text-subtle" aria-hidden /> Create your character
              </Link>
            </DropdownMenu.Item>
            {s.address ? (
              <Web3Only>
                <AccountAddress address={s.address} />
              </Web3Only>
            ) : null}
            <ExperienceItems />
            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <DropdownMenu.Item className={item} onSelect={() => void signOut()}>
              <LogOut className="size-4 text-subtle" aria-hidden /> Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  const c = s.state.character!;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface pl-1.5 pr-1.5 transition hover:bg-sunken"
          aria-label={`Account menu. ${c.name}, level ${s.level}, ${formatUsd(s.state.balance, { cents: "always" })} practice gold`}
        >
          <Avatar name={c.name} role={c.role} size={24} />
          <span className="font-mono text-sm text-ink tnum">{formatUsd(s.state.balance, { cents: "always" })}</span>
          <LevelRing level={s.level} progress={s.progress.pct} size={24} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[220px] animate-fade-in rounded-md bg-surface p-1 shadow-md"
        >
          <div className="px-2.5 py-2">
            <p className="text-sm font-medium text-ink">{c.name}</p>
            <p className="font-mono text-2xs text-subtle">
              Level {s.level} {c.role}
            </p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild className={item}>
            <Link href={routes.me}>
              <User className="size-4 text-subtle" aria-hidden /> My character
            </Link>
          </DropdownMenu.Item>
          {/* the same account can stream: one guild of its own, besides the guilds it plays in */}
          <DropdownMenu.Item asChild className={item}>
            <Link href={routes.studio}>
              <LayoutDashboard className="size-4 text-subtle" aria-hidden /> {s.state.realm ? "Creator studio" : "Start your guild"}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={item}
            onSelect={() =>
              run(async () => {
                const r = await s.actions.claimPracticeGold();
                if (r.ok) push({ tone: "success", title: `${formatUsd(PRACTICE_GOLD)} practice gold added`, action: viewTx(r.tx) });
                else push({ tone: "danger", title: "Couldn’t add practice gold", description: r.error });
              })
            }
          >
            <Coins className="size-4 text-subtle" aria-hidden /> Add practice gold
          </DropdownMenu.Item>
          {s.address ? (
              <Web3Only>
                <AccountAddress address={s.address} />
              </Web3Only>
            ) : null}
            <ExperienceItems />
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => void signOut()}>
            <LogOut className="size-4 text-subtle" aria-hidden /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
