"use client";

import * as React from "react";
import { RadioGroup } from "radix-ui";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import type { Battle, Quest } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useMounted } from "@/components/clock";
import { OverlayStage } from "@/components/overlay/overlay-stage";
import { ScaledCanvas } from "@/components/overlay/scaled-canvas";
import { useStudio, type AnchorPos, useRealmHandle } from "./studio-store";

const ANCHORS: { value: AnchorPos; label: string; dot: string }[] = [
  { value: "bottom-left", label: "Bottom left", dot: "bottom-1.5 left-1.5" },
  { value: "bottom-right", label: "Bottom right", dot: "bottom-1.5 right-1.5" },
  { value: "top-right", label: "Top right", dot: "right-1.5 top-1.5" },
];

const STEPS = [
  "In OBS, add a new Browser source to your scene.",
  "Paste the overlay URL below.",
  "Set the width to 1920 and the height to 1080.",
  "Done. The page is transparent, so it sits cleanly over your game.",
];

/** Copy your overlay URL, choose a corner, and preview it exactly as OBS will render it. */
export function StudioOverlay({ quest, battle }: { quest: Quest | null; battle: Battle | null }) {
  const studio = useStudio();
  const handle = useRealmHandle();
  const { push } = useToast();
  const mounted = useMounted();
  const [copied, setCopied] = React.useState(false);
  const { anchor, reducedMotion } = studio.state.overlay;

  const params = new URLSearchParams();
  if (anchor !== "bottom-left") params.set("anchor", anchor);
  if (reducedMotion) params.set("motion", "off");
  const query = params.toString();
  const path = `${routes.overlay(handle)}${query ? `?${query}` : ""}`;
  const url = `${mounted ? window.location.origin : ""}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      push({ tone: "success", title: "Overlay URL copied", duration: 2500 });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      push({ tone: "danger", title: "Couldn’t copy automatically", description: "Select the URL and copy it by hand." });
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl text-ink">Overlay</h1>
        <p className="mt-1 text-sm text-muted">Quest progress, live odds and viewer alerts on your stream. It&rsquo;s a web page, so it works in any streaming software.</p>
      </header>

      <Card className="p-4 md:p-5">
        <label htmlFor="overlay-url" className="mb-1.5 block text-sm font-medium text-ink">
          Your overlay URL
        </label>
        <div className="flex gap-2">
          <input
            id="overlay-url"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-10 min-w-0 flex-1 rounded-sm border border-line-strong bg-sunken px-3 font-mono text-xs text-ink focus-visible:border-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-tint"
          />
          <Button onClick={copy} variant="secondary">
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-subtle">Anyone with this link can see your overlay. It shows only public information.</p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <p id="anchor-label" className="mb-2 text-sm font-medium text-ink">
              Where it sits
            </p>
            <RadioGroup.Root
              value={anchor}
              onValueChange={(v) => studio.actions.setOverlay({ anchor: v as AnchorPos })}
              aria-labelledby="anchor-label"
              className="grid grid-cols-3 gap-2"
            >
              {ANCHORS.map((a) => (
                <RadioGroup.Item
                  key={a.value}
                  value={a.value}
                  className="rounded-md border border-line-strong bg-surface p-2 text-center transition duration-(--dur-micro) ease-out hover:bg-sunken data-[state=checked]:border-signal data-[state=checked]:bg-signal-tint"
                >
                  <span className="relative mx-auto block aspect-video w-full rounded-xs bg-sunken ring-1 ring-line-strong">
                    <span className={cn("absolute size-2 rounded-xs bg-ink", a.dot)} />
                  </span>
                  <span className="mt-1.5 block text-xs text-ink">{a.label}</span>
                </RadioGroup.Item>
              ))}
            </RadioGroup.Root>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Motion</p>
            <label className="flex items-start gap-3 text-sm text-ink">
              <Switch checked={reducedMotion} onCheckedChange={(v) => studio.actions.setOverlay({ reducedMotion: v })} aria-label="Still panels" className="mt-0.5" />
              <span>
                Still panels
                <span className="mt-0.5 block text-xs text-muted">Alerts appear without sliding in. Good for busy scenes.</span>
              </span>
            </label>
          </div>
        </div>
      </Card>

      <section aria-labelledby="preview">
        <h2 id="preview" className="mb-3 text-lg text-ink">
          Preview
        </h2>
        <div className="relative overflow-hidden rounded-md border border-line">
          <ScaledCanvas>
            <div className="scene scene-desk absolute inset-0" aria-hidden />
            <div className="absolute inset-0 bg-gradient-to-br from-ink/30 to-ink/60" aria-hidden />
            <OverlayStage quest={quest} battle={battle} anchor={anchor} demo />
          </ScaledCanvas>
          <span className="absolute left-3 top-3 rounded-xs bg-ink/55 px-2 py-1 font-mono text-2xs text-on-inverse backdrop-blur-sm">Preview on sample footage</span>
        </div>
        <p className="mt-2 text-xs text-subtle">The alerts and result banners here are samples. On stream they show your viewers&rsquo; real activity.</p>
      </section>

      <section aria-labelledby="obs">
        <h2 id="obs" className="mb-3 text-lg text-ink">
          Add it to OBS
        </h2>
        <ol className="space-y-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3 text-sm text-muted">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-2xs text-subtle tnum">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
