/** Small, pure pieces of the drag controls (ui/squish-switch, ui/slide-to-confirm). */

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** How far along its track a dragged handle is, 0 to 1. */
export const progressOf = (offset: number, travel: number) => (travel > 0 ? clamp(offset / travel, 0, 1) : 0);

/** A slide-to-confirm handle commits once it is dragged this far along. */
export const COMMIT_AT = 0.9;

export const slideCommits = (offset: number, travel: number) => progressOf(offset, travel) >= COMMIT_AT;

/**
 * The thumb stretches along its travel with speed and narrows to keep its area (a squash and
 * stretch). `velocity` is in px per ms; `stretch` is the most it may lengthen (0.35 = 35%).
 */
export function squash(velocity: number, stretch: number): { sx: number; sy: number } {
  const sx = 1 + stretch * clamp(Math.abs(velocity) / 1.5, 0, 1);
  return { sx, sy: 1 / sx };
}

/**
 * Where a switch lands when the pointer lets go: a tap flips it, a drag lands on the side the thumb
 * is nearer to.
 */
export function switchLands(offset: number, travel: number, checkedBefore: boolean, dragged: boolean): boolean {
  if (!dragged) return !checkedBefore;
  return progressOf(offset, travel) >= 0.5;
}
