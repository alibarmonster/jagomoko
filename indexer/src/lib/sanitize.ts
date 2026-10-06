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
  clip: 256, // ClipBoard.MAX_URL_BYTES
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

// ---- clip links -----------------------------------------------------------------------------------

export type ClipPlatform = "tiktok" | "youtube" | "twitch" | "instagram" | "x";
export type ClipLink = { url: string; platform: ClipPlatform };

/** `host` is `domain` or one of its subdomains: "www.tiktok.com" passes, "eviltiktok.com" does not. */
const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
const trimSlash = (path: string) => (path.length > 1 ? path.replace(/\/$/, "") : path);

/** Where a single clip or video lives on each platform. Each rule returns the canonical path, or nothing. */
const CLIP_RULES: readonly { platform: ClipPlatform; domains: readonly string[]; path: (u: URL) => string | undefined }[] = [
  {
    platform: "tiktok",
    domains: ["tiktok.com"],
    path: (u) => {
      if (/^\/@[\w.-]{1,64}\/video\/\d{5,25}\/?$/.test(u.pathname)) return trimSlash(u.pathname);
      // share links: vm.tiktok.com/ZMabc12/
      if ((u.hostname === "vm.tiktok.com" || u.hostname === "vt.tiktok.com") && /^\/[A-Za-z0-9]{5,20}\/?$/.test(u.pathname)) return u.pathname;
      return undefined;
    },
  },
  {
    platform: "youtube",
    domains: ["youtube.com", "youtu.be"],
    path: (u) => {
      if (u.hostname === "youtu.be") return /^\/[\w-]{11}\/?$/.test(u.pathname) ? trimSlash(u.pathname) : undefined;
      if (/^\/(shorts\/[\w-]{11}|clip\/[\w-]{10,40})\/?$/.test(u.pathname)) return trimSlash(u.pathname);
      const v = u.searchParams.get("v");
      return u.pathname === "/watch" && v && /^[\w-]{11}$/.test(v) ? `/watch?v=${v}` : undefined;
    },
  },
  {
    platform: "twitch",
    domains: ["twitch.tv"],
    path: (u) => {
      if (u.hostname === "clips.twitch.tv") return /^\/[\w-]{3,100}\/?$/.test(u.pathname) ? trimSlash(u.pathname) : undefined;
      return /^\/\w{3,25}\/clip\/[\w-]{3,100}\/?$/.test(u.pathname) ? trimSlash(u.pathname) : undefined;
    },
  },
  {
    platform: "instagram",
    domains: ["instagram.com"],
    path: (u) => (/^\/reels?\/[\w-]{5,40}\/?$/.test(u.pathname) ? trimSlash(u.pathname) : undefined),
  },
  {
    platform: "x",
    domains: ["x.com", "twitter.com"],
    path: (u) => (/^\/\w{1,15}\/status\/\d{5,25}\/?$/.test(u.pathname) ? trimSlash(u.pathname) : undefined),
  },
];

/**
 * A Bard's clip link, if it is safe to show: https only, on one of the clip platforms (the exact
 * domain or a subdomain of it), and shaped like a single clip or video. The link is rebuilt from its
 * host and path, so tracking parameters, fragments and anything else in the raw input are dropped.
 */
export function clipUrl(raw: string): ClipLink | undefined {
  if (typeof raw !== "string") return undefined;
  const input = raw.trim();
  if (input.length === 0 || input.length > LIMITS.clip) return undefined;
  if (ANY_CONTROL.test(input) || new RegExp(INVISIBLE.source, "u").test(input)) return undefined;
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return undefined;
  const rule = CLIP_RULES.find((r) => r.domains.some((d) => onDomain(u.hostname, d)));
  const path = rule?.path(u);
  return rule && path ? { platform: rule.platform, url: `https://${u.hostname}${path}` } : undefined;
}
