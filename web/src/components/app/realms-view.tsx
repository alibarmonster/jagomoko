import * as React from "react";
import Link from "next/link";
import { formatUsd } from "@/lib/money";
import { routes } from "@/lib/routes";
import type { RealmSummary } from "@/lib/data";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/skeleton";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Every realm, most supported first. Viewers pick one to tip, back and play in. */
export function RealmsView({ realms }: { realms: RealmSummary[] }) {
  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <h1 className="text-2xl text-ink">Realms</h1>
        <p className="mt-2 text-base text-muted">Pick a streamer to tip, back their quests and call their matches.</p>
      </header>

      {realms.length === 0 ? (
        <EmptyState
          title="No realms yet"
          description="A realm is a streamer's page. Be the first to open one."
          action={<ButtonLink href={routes.studio}>Open your realm</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {realms.map(({ creator, openQuests, liveBattles }) => (
            <li key={creator.id}>
              <Link href={routes.realm(creator.handleKey)} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-tint">
                <Card className="p-4 transition-colors hover:bg-sunken">
                  <div className="flex items-center gap-3">
                    <Avatar name={creator.handle} seed={creator.owner} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-ink">{creator.handle}</p>
                      <p className="font-mono text-2xs text-subtle">@{creator.handleKey}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-muted">
                    {plural(openQuests, "open quest", "open quests")} &middot; {plural(liveBattles, "live battle", "live battles")}
                  </p>
                  <p className="mt-1 font-mono text-xs text-subtle tnum">{formatUsd(creator.totalReceived)} received</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
