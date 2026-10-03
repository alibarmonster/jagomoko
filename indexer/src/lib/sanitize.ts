// Every string emitted by the contracts is chosen by an arbitrary user and must
// be treated as hostile before it reaches the database, the GraphQL API, the
// web app or a streamer's OBS overlay.

export const LIMITS = {
  handle: 32,
  name: 24,
  title: 120,
  side: 32,
  memo: 140,
  description: 1_000,
  reason: 64,
  url: 2_048,
} as const;

// C0/C1 control characters, except \t (normalized to a space by the whitespace
// collapse) and \n (kept only where explicitly allowed).
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
// Any control character at all — used for URLs, where even \t/\n must be
// rejected (the URL parser silently strips them, hiding the tampering).
const ANY_CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const NEWLINE = /\r?\n|\r/g;
// Bidi overrides/isolates ("Trojan Source" text spoofing), zero-width and
// invisible formatting characters, BOM, and Unicode tag characters.
const INVISIBLE =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB]|[\u{E0000}-\u{E007F}]/gu;
// Unicode combining marks: legitimate for many languages, but long stacks
// ("zalgo") are used to break layouts. Cap them per base character.
const MARK_RUN = /(\p{M}{3})\p{M}+/gu;

export type Cleaned = { value: string; changed: boolean };

/**
 * Normalizes and strips dangerous characters, collapses whitespace and
 * truncates to `max` code points (never splitting a surrogate pair).
 */
export function cleanText(raw: string, max: number, opts: { multiline?: boolean } = {}): Cleaned {
  let s = typeof raw === "string" ? raw : "";
  s = s.normalize("NFKC");
  s = s.replace(INVISIBLE, "");
  if (opts.multiline) {
    s = s.replace(NEWLINE, "\n").replace(CONTROL, "");
    s = s
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  } else {
    s = s.replace(NEWLINE, " ").replace(CONTROL, "");
    s = s.replace(/\s+/g, " ");
  }
  s = s.replace(MARK_RUN, "$1").trim();

  const chars = Array.from(s);
  if (chars.length > max) s = chars.slice(0, Math.max(0, max - 1)).join("").trimEnd() + "…";

  return { value: s, changed: s !== raw };
}

/** Lowercase lookup key for handles (case-insensitive routes like /c/[handle]). */
export function handleKey(cleanedHandle: string): string {
  return cleanedHandle.toLowerCase();
}

/**
 * Returns a canonical http(s) URL, or undefined for anything else
 * (javascript:, data:, file:, ipfs:, embedded credentials, oversize input...).
 * The raw input is never stored, so a malicious link can't reach an <a href>.
 */
export function safeUrl(raw: string): string | undefined {
  if (typeof raw !== "string") return undefined;
  const input = raw.trim();
  if (input.length === 0 || input.length > LIMITS.url) return undefined;
  // non-global copy of INVISIBLE: .test() on a /g regex is stateful (lastIndex)
  if (ANY_CONTROL.test(input) || new RegExp(INVISIBLE.source, "u").test(input)) return undefined;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (url.username || url.password) return undefined;
  if (!url.hostname || !url.hostname.includes(".")) return undefined; // no localhost / bare hosts
  const href = url.toString();
  return href.length > LIMITS.url ? undefined : href;
}
