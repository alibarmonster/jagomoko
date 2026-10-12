"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatUsd } from "@/lib/utils/money";
import { motionOff } from "@/lib/utils/motion";
import { ROLE_META, type Role } from "@/lib/domain/roles";
import { RoleSigil } from "@/components/ui/sigil";
import { Mascot } from "@/components/ui/mascot";
import { PRACTICE_GOLD } from "@/components/session";

/** "intro" while the viewer signs in, "role" while they pick one, "reward" once the character is here. */
export type ShowcaseStage = "intro" | "role" | "reward";

const art = (role: Role) => ({
  src: `/roles/${role.toLowerCase()}-1080.webp`,
  srcSet: `/roles/${role.toLowerCase()}-640.webp 640w, /roles/${role.toLowerCase()}-1080.webp 1080w`,
});

// what you do here, in the landing page's own words (components/landing/how-it-works.tsx)
const SLIDES: { role: Role; eyebrow: string; text: string }[] = [
  { role: "Knight", eyebrow: "Quests", text: "Back a stream challenge. If it’s completed, the pool goes to the creator. If it’s missed, you get 90% back." },
  { role: "Seer", eyebrow: "Battles", text: "Pick a side on the match. Winners split the losing side. There is no house." },
  { role: "Bard", eyebrow: "Clips", text: "Clip the best moment. The community votes, and the best clip takes the bounty." },
];

const SLIDE_MS = 6000;

/** One full-bleed role picture with the dark fade the text sits on. */
function Art({ role, className }: { role: Role; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative art in a fixed panel
    <img
      key={role}
      {...art(role)}
      sizes="440px"
      alt=""
      aria-hidden
      draggable={false}
      className={cn("absolute inset-0 size-full animate-fade-in object-cover object-top", className)}
    />
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-sm border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-sm">
      <p className="font-mono text-sm text-on-inverse tnum">{value}</p>
      <p className="text-2xs text-on-inverse-muted">{label}</p>
    </div>
  );
}

/**
 * The art side of the Create your character popup (desktop only). It follows the flow: what you can
 * do here while you sign in, the role you are looking at while you pick one, and a cheer at the end.
 */
export function AuthShowcase({ stage, role, className }: { stage: ShowcaseStage; role: Role; className?: string }) {
  const [slide, setSlide] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (stage !== "intro" || paused || motionOff()) return;
    const t = window.setInterval(() => setSlide((i) => (i + 1) % SLIDES.length), SLIDE_MS);
    return () => window.clearInterval(t);
  }, [stage, paused]);

  const frame = "relative isolate flex flex-col justify-end overflow-hidden rounded-md bg-inverse text-on-inverse";

  if (stage === "reward") {
    return (
      <div className={cn(frame, "items-center justify-center text-center", className)}>
        <Mascot name="moko-party" height={220} eager className="animate-mascot-hop" />
        <p className="mt-4 font-mono text-2xs uppercase tracking-wide text-on-inverse-muted">Practice gold</p>
        <p className="mt-1 font-mono text-3xl text-on-inverse tnum">{formatUsd(PRACTICE_GOLD)}</p>
        <p className="mt-2 max-w-[30ch] text-sm text-on-inverse-muted">No real money while we&rsquo;re on testnet. Spend it on anything.</p>
      </div>
    );
  }

  if (stage === "role") {
    const meta = ROLE_META[role];
    return (
      <div className={cn(frame, className)}>
        <Art role={role} />
        <div className="relative bg-gradient-to-t from-ink/90 via-ink/60 to-transparent p-6 pt-24">
          <RoleSigil role={role} className="size-6" />
          <p className="mt-2 text-xl">{role}</p>
          <p className="mt-0.5 text-sm text-on-inverse-muted">Earns XP from {meta.earns}</p>
          <p className="mt-3 max-w-[36ch] text-sm text-on-inverse">{meta.blurb}</p>
        </div>
      </div>
    );
  }

  const s = SLIDES[slide]!;
  const go = (d: number) => setSlide((i) => (i + d + SLIDES.length) % SLIDES.length);
  return (
    <div className={cn(frame, className)} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <Art role={s.role} />
      <p className="absolute left-5 top-5 rounded-full bg-ink/55 px-2.5 py-1 font-mono text-2xs uppercase tracking-wide text-on-inverse backdrop-blur-sm">
        Why players join
      </p>
      <div className="relative bg-gradient-to-t from-ink/90 via-ink/65 to-transparent p-6 pt-28">
        <p className="font-mono text-2xs uppercase tracking-wide text-on-inverse-muted">{s.eyebrow}</p>
        <p key={slide} className="mt-2 max-w-[34ch] animate-fade-in text-lg leading-snug">
          {s.text}
        </p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Stat value={formatUsd(PRACTICE_GOLD)} label="practice gold" />
          <Stat value="4" label="roles to pick" />
          <Stat value="1" label="email to start" />
        </div>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-1.5" role="tablist" aria-label="Slides">
            {SLIDES.map((x, i) => (
              <button
                key={x.eyebrow}
                type="button"
                role="tab"
                aria-selected={i === slide}
                aria-label={x.eyebrow}
                onClick={() => setSlide(i)}
                className={cn("h-1.5 rounded-full transition-all duration-(--dur-ui)", i === slide ? "w-5 bg-on-inverse" : "w-1.5 bg-white/35 hover:bg-white/60")}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => go(-1)} aria-label="Previous" className="inline-flex size-8 items-center justify-center rounded-sm border border-white/15 bg-white/10 transition-colors hover:bg-white/20">
              <ArrowLeft className="size-4" aria-hidden />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next" className="inline-flex size-8 items-center justify-center rounded-sm border border-white/15 bg-white/10 transition-colors hover:bg-white/20">
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
