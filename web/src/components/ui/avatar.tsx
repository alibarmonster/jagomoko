import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { hashHue, initials } from "@/lib/utils/format";
import type { Role } from "@/lib/domain/roles";
import { RoleSigil } from "./sigil";

const SIZES = {
  20: "size-5 text-[9px]",
  24: "size-6 text-[10px]",
  32: "size-8 text-2xs",
  40: "size-10 text-xs",
  56: "size-14 text-sm",
} as const;

export type AvatarSize = keyof typeof SIZES;

/** Warm, low-chroma tint from a stable seed — avatars never introduce a second accent color. */
function tint(seed: string) {
  const hue = 24 + (hashHue(seed) % 40); // stays in the warm stone range
  return `hsl(${hue} 14% 90%)`;
}

export function Avatar({
  name,
  seed,
  role,
  size = 24,
  className,
}: {
  name: string;
  seed?: string;
  role?: Role;
  size?: AvatarSize;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-line font-mono font-medium text-ink-2 select-none",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: tint(seed ?? name) }}
      aria-hidden
    >
      {role ? <RoleSigil role={role} className="size-[58%]" /> : initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 5,
  total,
  size = 24,
  className,
}: {
  people: { name: string; seed?: string; role?: Role }[];
  max?: number;
  /** Real number of people when `people` is only a preview */
  total?: number;
  size?: AvatarSize;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const extra = Math.max(0, (total ?? people.length) - shown.length);
  return (
    <span className={cn("inline-flex items-center", className)}>
      {shown.map((p, i) => (
        <Avatar
          key={`${p.name}-${i}`}
          name={p.name}
          seed={p.seed}
          role={p.role}
          size={size}
          className={cn("ring-2 ring-surface", i > 0 && "-ml-1.5")}
        />
      ))}
      {extra > 0 ? (
        <span className="ml-1.5 font-mono text-2xs text-subtle tnum" aria-hidden>
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
