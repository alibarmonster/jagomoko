/**
 * True when animation should be skipped: the visitor prefers reduced motion, or
 * the URL carries ?motion=off (QA, print, streamers who want a still overlay).
 * Client-only; returns false during server rendering.
 */
export function motionOff(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    new URLSearchParams(window.location.search).get("motion") === "off"
  );
}
