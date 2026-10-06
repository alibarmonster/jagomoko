"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { siInstagram, siTiktok, siTwitch, siX, siYoutube } from "simple-icons";
import { cn } from "@/lib/utils/cn";
import { PLATFORM_LABEL, youtubeThumb } from "@/lib/domain/clips";
import { clipUrl, type ClipPlatform } from "@/lib/utils/sanitize";
import type { Clip } from "@/lib/data/types";
import { Avatar } from "@/components/ui/avatar";
import { Mascot } from "@/components/ui/mascot";
import { PhotoFrame } from "@/components/ui/photo-frame";

const ICONS: Record<ClipPlatform, { path: string }> = { tiktok: siTiktok, youtube: siYoutube, twitch: siTwitch, instagram: siInstagram, x: siX };

export function PlatformIcon({ platform, className }: { platform: ClipPlatform; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("fill-current", className)} role="img" aria-label={PLATFORM_LABEL[platform]}>
      <path d={ICONS[platform].path} />
    </svg>
  );
}

/**
 * One clip: its still (YouTube) or our own art, where it lives, who made it and its votes. The link
 * is checked again here before it becomes an href, and it always opens the platform in a new tab.
 */
export function ClipCard({ clip, badge, footer }: { clip: Clip; badge?: React.ReactNode; footer?: React.ReactNode }) {
  const link = clip.url ? clipUrl(clip.url) : undefined;
  const still = youtubeThumb(link?.url);
  if (!link) return null;

  return (
    <li className="min-w-0">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="group block overflow-hidden rounded-md border border-line bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        aria-label={`Watch ${clip.authorName}’s clip on ${PLATFORM_LABEL[link.platform]} (opens in a new tab)`}
      >
        <div className="relative aspect-[4/5]">
          {still ? (
            // eslint-disable-next-line @next/next/no-img-element -- a remote still from YouTube's image host
            <img src={still} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
          ) : (
            <PhotoFrame scene="bard" className="absolute inset-0 rounded-none">
              <div className="flex size-full items-end justify-center pb-4">
                <Mascot name="bard-idle" height={96} />
              </div>
            </PhotoFrame>
          )}
          <span className="absolute left-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-ink/75 text-white">
            <PlatformIcon platform={link.platform} className="size-3.5" />
          </span>
          {badge ? <span className="absolute right-2 top-2">{badge}</span> : null}
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-xs bg-ink/75 px-1.5 py-0.5 font-mono text-2xs text-white">
            Watch <ExternalLink className="size-3" aria-hidden />
          </span>
        </div>
      </a>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={clip.authorName} seed={clip.author} role={clip.authorRole} size={20} />
          <span className="truncate text-sm text-ink">{clip.authorName}</span>
          {clip.authorLevel ? <span className="font-mono text-2xs text-subtle tnum">Lv.{clip.authorLevel}</span> : null}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted tnum" title="Votes count by XP: each one weighs the square root of the voter’s XP">
          {clip.votes} {clip.votes === 1 ? "vote" : "votes"}
        </span>
      </div>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </li>
  );
}
