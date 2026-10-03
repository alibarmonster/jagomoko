import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatUsd } from "@/lib/money";
import { routes } from "@/lib/routes";
import type { Creator } from "@/lib/data/types";
import { Avatar } from "@/components/ui/avatar";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { LiveDot } from "@/components/ui/status-pill";

/** A creator's realm: ambient banner, live state, and the community treasury at a glance. */
export function RealmHeader({ creator, live = true }: { creator: Creator; live?: boolean }) {
  return (
    <section aria-labelledby="realm-title">
      <PhotoFrame scene="banner" className="h-28 sm:h-36">
        <div className="absolute inset-0 bg-gradient-to-t from-ink/35 to-transparent" />
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
              {live ? (
                <>
                  <LiveDot /> Live now
                </>
              ) : (
                "Offline"
              )}
              <span aria-hidden>·</span>
              <span>@{creator.handleKey}</span>
            </p>
            <h1 id="realm-title" className="mt-0.5 text-2xl text-ink">
              {creator.handle}&rsquo;s realm
            </h1>
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
    </section>
  );
}
