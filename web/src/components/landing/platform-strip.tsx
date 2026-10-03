import * as React from "react";
import { siKick, siObsstudio, siTiktok, siTwitch, siYoutube } from "simple-icons";

const LOGOS = [
  { name: "Twitch", icon: siTwitch },
  { name: "YouTube", icon: siYoutube },
  { name: "Kick", icon: siKick },
  { name: "TikTok Live", icon: siTiktok },
  { name: "OBS Studio", icon: siObsstudio },
] as const;

/**
 * Replaces a customer-logo row: we have no customers to show, and invent none.
 * The claim is true because the overlay is a plain web page (an OBS browser
 * source). Logos are Simple Icons marks, monochrome, in a shared 64px box.
 */
export function PlatformStrip() {
  return (
    <section aria-label="Platforms" className="border-y border-line">
      <div className="container-page flex flex-col items-center gap-x-10 gap-y-3 py-6 sm:flex-row sm:justify-between">
        <p className="text-sm text-subtle" data-rise>
          Works with any platform you stream to
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-4" data-rise>
          {LOGOS.map((l) => (
            <li key={l.name} className="flex size-16 items-center justify-center" title={l.name}>
              <svg viewBox="0 0 24 24" className="size-6 fill-muted" role="img" aria-label={l.name}>
                <path d={l.icon.path} />
              </svg>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
