/**
 * Input hygiene shared by forms and previews. Mirrors indexer/src/lib/sanitize.ts
 * so what a player sees while typing is exactly what the public record will
 * show (the indexer is the authority; this is the preview of its rules).
 */

export const LIMITS = {
  name: 24,
  handle: 32,
  title: 120,
  side: 32,
  memo: 140,
  description: 1_000,
  url: 2_048,
} as const;

// C0/C1 control characters except \t (collapsed to a space) and \n (multiline only).
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
const ANY_CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
// Bidi overrides/isolates ("Trojan Source"), zero-width and invisible formatting characters, tag characters.
const INVISIBLE =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFFB]|[\u{E0000}-\u{E007F}]/gu;
const MARK_RUN = /(\p{M}{3})\p{M}+/gu;

export type Cleaned = { value: string; changed: boolean };

/** Normalizes, strips dangerous characters, collapses whitespace and truncates by code point. */
export function cleanText(raw: string, max: number, opts: { multiline?: boolean } = {}): Cleaned {
  const input = typeof raw === "string" ? raw : "";
  let s = input.normalize("NFKC").replace(INVISIBLE, "");
  if (opts.multiline) {
    s = s.replace(/\r?\n|\r/g, "\n").replace(CONTROL, "");
    s = s
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  } else {
    s = s.replace(/\r?\n|\r/g, " ").replace(CONTROL, "").replace(/\s+/g, " ");
  }
  s = s.replace(MARK_RUN, "$1").trim();
  const chars = Array.from(s);
  if (chars.length > max) s = chars.slice(0, Math.max(0, max - 1)).join("").trimEnd() + "…";
  return { value: s, changed: s !== input.trim() };
}

/** Canonical http(s) URL, or undefined for anything else (javascript:, data:, credentials, localhost...). */
export function safeUrl(raw: string): string | undefined {
  if (typeof raw !== "string") return undefined;
  const input = raw.trim();
  if (input.length === 0 || input.length > LIMITS.url) return undefined;
  if (ANY_CONTROL.test(input) || new RegExp(INVISIBLE.source, "u").test(input)) return undefined;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (url.username || url.password) return undefined;
  if (!url.hostname || !url.hostname.includes(".")) return undefined;
  const href = url.toString();
  return href.length > LIMITS.url ? undefined : href;
}
