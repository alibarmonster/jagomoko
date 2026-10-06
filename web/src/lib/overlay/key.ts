/**
 * The private key in a streamer's overlay URL (?key=...). Whoever has the URL can send test alerts
 * to that overlay, so it is random and long enough to be impossible to guess. It is not a login:
 * the overlay itself only ever shows public information, and a test alert has fixed content.
 */

const BYTES = 24;
export const OVERLAY_KEY_LENGTH = 32; // 24 bytes as base64url, no padding
const PATTERN = /^[A-Za-z0-9_-]{32}$/;

/** A fresh random key (24 bytes from the platform's CSPRNG, base64url). */
export function newOverlayKey(): string {
  const bytes = new Uint8Array(BYTES);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isOverlayKey(value: unknown): value is string {
  return typeof value === "string" && PATTERN.test(value);
}
