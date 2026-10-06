"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/money";
import { routes } from "@/lib/routes";
import { guildRank, memberRank, nextRank } from "@/lib/guild";
import type { Guild, Member } from "@/lib/data/types";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/skeleton";
import { RelativeTime } from "@/components/ui/relative-time";
import { useSession } from "@/components/session";
import { RankBadge } from "./guild-rank";
import { SectionHeading } from "./section-heading";

const sameAccount = (a: string | null | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

function MemberRow({ member, place, guild, you, compact }: { member: Member; place: number; guild: Guild; you: boolean; compact?: boolean }) {
  const p = member.player;
  return (
    <li
      className={cn("grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-1 py-3 sm:grid-cols-[2.5rem_1fr_auto]", you && "rounded-md bg-signal-tint px-3")}
      aria-current={you ? "true" : undefined}
    >
      <span className={cn("font-mono text-sm tnum", place <= 3 ? "text-ink" : "text-subtle")}>{String(place).padStart(2, "0")}</span>
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={p.name} seed={p.id} role={p.role} size={32} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-medium text-ink">
              {p.name}
              {you ? <span className="text-muted"> (you)</span> : null}
            </span>
            <RankBadge rank={memberRank(member, guild)} />
          </span>
          {compact ? null : (
            <span className="mt-0.5 block font-mono text-2xs text-subtle">
              Lv.{p.level} {p.role}
              {member.totalTipped > 0n ? ` · tipped ${formatUsd(member.totalTipped)}` : ""}
              {member.totalBacked > 0n ? ` · backed ${formatUsd(member.totalBacked)}` : ""} · active <RelativeTime at={member.lastActiveAt} />
            </span>
          )}
        </span>
      </span>
      <span className="text-right">
        <span className="font-mono text-sm text-ink tnum">{member.guildXp.toString()}</span>
        <span className="block font-mono text-2xs text-subtle">guild XP</span>
      </span>
    </li>
  );
}

/**
 * The guild's members by the XP they earned here. Your own row is marked; when you are further down
 * than the list goes, it is pinned at the bottom with what you need for the next rank.
 */
export function GuildMembers({ guild, creatorId, handle, compact }: { guild: Guild; creatorId: string; handle: string; compact?: boolean }) {
  const s = useSession();
  const mine = s.state.guilds.find((g) => g.creatorId === creatorId);
  const shown = compact ? guild.members.slice(0, 5) : guild.members;
  const listed = shown.some((m) => sameAccount(s.address, m.player.id));
  const next = mine ? nextRank(mine.guildXp) : null;

  if (guild.members.length === 0) {
    return compact ? null : (
      <EmptyState
        title="No members yet"
        description={`Tip ${handle}, back a quest or pick a side in a battle, and you join the guild. Every bit of XP you earn here counts toward your rank.`}
      />
    );
  }

  return (
    <section aria-labelledby={compact ? "top-members" : "members-title"}>
      {compact ? (
        <SectionHeading id="top-members" title="Top of the guild" className="mb-1" />
      ) : (
        <SectionHeading id="members-title" title="Members" meta={`${guild.memberCount} in the guild`} />
      )}
      <Card className={compact ? "border-0 bg-transparent shadow-none" : "px-3 sm:px-4"}>
        <ol className="divide-y divide-line">
          {shown.map((m, i) => (
            <MemberRow key={m.id} member={m} place={i + 1} guild={guild} you={sameAccount(s.address, m.player.id)} compact={compact} />
          ))}
        </ol>
        {mine && !listed && !compact ? (
          <div className="mt-1 flex items-center justify-between gap-3 rounded-md bg-signal-tint px-3 py-3 text-sm">
            <span className="flex items-center gap-2">
              <span className="font-medium text-ink">You</span>
              <RankBadge rank={guildRank(mine.guildXp, mine.isJago)} />
            </span>
            <span className="font-mono text-ink tnum">{mine.guildXp.toString()} guild XP</span>
          </div>
        ) : null}
      </Card>
      {compact ? (
        <Link href={routes.members(handle)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          All {guild.memberCount} members <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : (
        <p className="mt-3 text-xs text-subtle">
          {mine && next
            ? `${next.missing.toString()} more guild XP and you are a ${next.rank}. `
            : "Recruit under 100 guild XP, Member from 100, Veteran from 500. "}
          The member with the most guild XP is the guild&rsquo;s Jago. Anonymous tips never count here.
        </p>
      )}
    </section>
  );
}
