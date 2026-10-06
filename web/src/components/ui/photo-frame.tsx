import * as React from "react";
import { cn } from "@/lib/utils/cn";

export type Scene = "room" | "couch" | "desk" | "crowd" | "knight" | "seer" | "judge" | "bard" | "banner";

/**
 * Warm, out-of-focus backdrop. Until licensed photography is added, a
 * procedural "ambient scene" (layered light + grain, see globals.css) carries
 * the mood. Pass `src` to use a real photo instead; the sample label stays.
 */
export function PhotoFrame({
  scene = "room",
  src,
  srcSet,
  sizes,
  alt = "",
  label,
  className,
  imgClassName,
  children,
}: {
  scene?: Scene;
  src?: string;
  /** Responsive candidates for `src`, e.g. "/a-640.webp 640w, /a-1080.webp 1080w" */
  srcSet?: string;
  sizes?: string;
  alt?: string;
  /** Mono tag in the bottom-left, e.g. "Sample stream" */
  label?: string;
  className?: string;
  /** e.g. an object-position, to keep the subject of a wide image in view */
  imgClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("scene rounded-md", `scene-${scene}`, className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} srcSet={srcSet} sizes={sizes} alt={alt} className={cn("absolute inset-0 -z-10 size-full object-cover", imgClassName)} loading="lazy" />
      ) : null}
      <div className="relative z-10 size-full">{children}</div>
      {label ? (
        <span className="absolute bottom-3 left-3 z-20 rounded-xs bg-ink/55 px-2 py-1 font-mono text-2xs text-on-inverse backdrop-blur-sm">
          {label}
        </span>
      ) : null}
    </div>
  );
}
