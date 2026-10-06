import * as React from "react";
import Link from "next/link";
import { ArrowRight, Crown, Users } from "lucide-react";
import { formatUsd } from "@/lib/utils/money";
import { routes } from "@/lib/routing/routes";
import { guildTag } from "@/lib/domain/guild";
import { SCENES } from "@/lib/domain/mascots";
import type { Creator, Guild } from "@/lib/data/types";
import { Avatar } from "@/components/ui/avatar";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { LiveDot } from "@/components/ui/status-pill";
import { GuildTabs } from "./guild-tabs";

const BANNER = {
  src: `/scenes/banner-${SCENES.banner.widths[0]}.webp`,
  srcSet: SCENES.banner.widths.map((w) => `/scenes/banner-${w}.webp ${w}w`).join(", "),
};

/**
 * A creator's guild: the banner with the whole cast, who runs it, how many joined and who leads
 * them, the community treasury, and the guild's pages. `live` null hides the status (we only say
 * "Live now" when we actually know).
 */
export function RealmHeader({ creator, guild, live = true }: { creator: Creator; guild?: Guild; live?: boolean | null }) {
  const jago = guild?.jagoId ? guild.members.find((m) => m.id === guild.jagoId) : undefined;
  return (
    <section aria-labelledby="realm-title">
      <PhotoFrame
        scene="banner"
        src={BANNER.src}
        srcSet={BANNER.srcSet}
        sizes="(min-width: 1280px) 1216px, 100vw"
        imgClassName="object-[center_64%]"
        className="h-28 sm:h-36"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-ink/25 to-transparent" />
      </PhotoFrame>
      <div className="relative z-10 mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-1 sm:px-4">
        <div className="flex items-start gap-4">
          <Avatar
            name={creator.handle}
            seed={creator.owner}
            size={56}
            className="-mt-10 size-16 border-2 border-canvas text-base sm:-mt-12 sm:size-20 sm:text-lg"
          />
          <div className="pt-0.5">
            <p className="flex items-center gap-2 font-mono text-2xs text-subtle">
              {live === null ? null : live ? (
                <>
                  <LiveDot /> Live now
                </>
              ) : (
                "Offline"
              )}
              {live === null ? null : <span aria-hidden>·</span>}
              <span>@{creator.handleKey}</span>
            </p>
            <h1 id="realm-title" className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-2xl text-ink">
              {creator.handle}&rsquo;s guild
              <span className="font-mono text-xs text-subtle">{guildTag(creator.handle)}</span>
            </h1>
            {guild ? (
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-3.5" aria-hidden />
                  <span className="font-mono text-ink tnum">{guild.memberCount}</span> {guild.memberCount === 1 ? "member" : "members"}
                </span>
                {jago ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Crown className="size-3.5 text-pending" aria-hidden />
                    Jago <span className="font-medium text-ink">{jago.player.name}</span>
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
        <Link
          href={routes.treasury(creator.handleKey)}
          className="group rounded-md border border-line bg-surface px-4 py-2.5 shadow-sm transition hover:bg-sunken sm:-mt-14"
        >
          <span className="block text-xs text-subtle">Community treasury</span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-lg text-ink tnum">{formatUsd(creator.treasuryBalance, { cents: "always" })}</span>
            <ArrowRight className="size-3.5 text-subtle transition group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      </div>
      <GuildTabs handle={creator.handleKey} className="mt-5" />
    </section>
  );
}
