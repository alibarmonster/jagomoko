import * as React from "react";
import { cn } from "@/lib/cn";
import { MASCOTS, type MascotName } from "@/lib/mascots";
import type { Role } from "@/lib/roles";

export type Pose = "idle" | "cheer" | "wave" | "peek" | "oops";

/** The cut-out of a role in a pose, e.g. mascotFor("Bard", "cheer") -> "bard-cheer". */
export const mascotFor = (role: Role, pose: Pose): MascotName => `${role.toLowerCase()}-${pose}` as MascotName;

/**
 * A mascot cut-out (public/mascots, made by `bun run mascots`). `height` is the size on screen in
 * CSS pixels; the file is picked so it stays sharp on a 2x screen. Its box is reserved before it
 * loads, so nothing jumps. Decorative unless `alt` says otherwise.
 */
export function Mascot({
  name,
  height,
  alt = "",
  className,
  eager,
  ...rest
}: {
  name: MascotName;
  height: number;
  alt?: string;
  className?: string;
  /** load it straight away (above the fold) instead of when it comes near the screen */
  eager?: boolean;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "width" | "height" | "alt">) {
  const size = MASCOTS[name];
  const width = Math.round((size.width / size.height) * height);
  const file = height <= 160 ? 320 : 640;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a fixed-size cut-out: next/image would add nothing here
    <img
      src={`/mascots/${name}-${file}.webp`}
      width={width}
      height={height}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={cn("pointer-events-none select-none", className)}
      {...rest}
    />
  );
}
