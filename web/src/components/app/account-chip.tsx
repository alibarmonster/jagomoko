"use client";

import * as React from "react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { Coins, LogOut, User } from "lucide-react";
import { formatUsd } from "@/lib/money";
import { routes } from "@/lib/routes";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LevelRing } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { PRACTICE_GOLD, useSession } from "@/components/session";
import { usePending } from "@/lib/use-pending";
import { AuthDialog } from "./auth-dialog";

const item =
  "flex cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-sunken";

/** Avatar + balance + level ring. Anonymous viewers get a single call to action. */
export function AccountChip() {
  const s = useSession();
  const { push } = useToast();
  const { run } = usePending();

  if (!s.ready) return <div className="h-9 w-32" aria-hidden />;

  if (!s.signedIn || !s.hasCharacter) {
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
          <DropdownMenu.Item
            className={item}
            onSelect={() =>
              run(async () => {
                const r = await s.actions.claimPracticeGold();
                if (r.ok) push({ tone: "success", title: `${formatUsd(PRACTICE_GOLD)} practice gold added` });
                else push({ tone: "danger", title: "Couldn’t add practice gold", description: r.error });
              })
            }
          >
            <Coins className="size-4 text-subtle" aria-hidden /> Add practice gold
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => s.actions.signOut()}>
            <LogOut className="size-4 text-subtle" aria-hidden /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
