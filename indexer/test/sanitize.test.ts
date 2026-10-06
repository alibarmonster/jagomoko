import { describe, expect, it } from "vitest";
import { cleanText, clipUrl, handleKey, safeUrl } from "../src/lib/sanitize.js";
import { bigSqrt, levelForXP } from "../src/lib/domain.js";

describe("cleanText", () => {
  it("strips bidi overrides used for filename / name spoofing", () => {
    const r = cleanText("admin\u202Egnp.exe", 32);
    expect(r.value).toBe("admingnp.exe");
    expect(r.changed).toBe(true);
  });

  it("removes zero-width and invisible characters", () => {
    expect(cleanText("ali\u200Bce\uFEFF\u2060", 32).value).toBe("alice");
    expect(cleanText("\u{E0041}tag", 32).value).toBe("tag");
  });

  it("removes control characters and collapses whitespace", () => {
    expect(cleanText("a\u0000b\u0007\tc \n\r d", 32).value).toBe("ab c d");
  });

  it("keeps paragraphs only in multiline mode", () => {
    expect(cleanText("line1\n\n\n\nline2", 100, { multiline: true }).value).toBe("line1\n\nline2");
    expect(cleanText("line1\nline2", 100).value).toBe("line1 line2");
  });

  it("caps combining-mark stacks (zalgo)", () => {
    const zalgo = "Z" + "\u0301".repeat(50);
    expect(Array.from(cleanText(zalgo, 100).value)).toHaveLength(4);
  });

  it("truncates by code point without splitting emoji", () => {
    const r = cleanText("😀".repeat(30), 10);
    expect(Array.from(r.value)).toHaveLength(10);
    expect(r.value.endsWith("…")).toBe(true);
    expect(r.value).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("normalizes full-width look-alikes (NFKC)", () => {
    expect(cleanText("\uFF41\uFF44\uFF4D\uFF49\uFF4E", 32).value).toBe("admin");
  });

  it("leaves benign text untouched", () => {
    const r = cleanText("Beat the boss in < 1h!", 120);
    expect(r).toEqual({ value: "Beat the boss in < 1h!", changed: false });
  });

  it("handles non-string input defensively", () => {
    expect(cleanText(undefined as unknown as string, 10).value).toBe("");
  });

  it("builds case-insensitive handle keys", () => {
    expect(handleKey("ShroudTV")).toBe("shroudtv");
  });
});

describe("safeUrl", () => {
  it.each([
    ["javascript:alert(1)"],
    ["JAVASCRIPT:alert(1)"],
    ["  javascript:alert(document.cookie)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["file:///etc/passwd"],
    ["vbscript:msgbox"],
    ["ipfs://bafy"],
    ["https://user:pass@evil.com"],
    ["http://localhost:3000"],
    ["https://twitch.tv/\nvod"],
    ["https://twit\u200Bch.tv/vod"],
    ["not a url"],
    [""],
    ["https://" + "a".repeat(2050) + ".com"],
  ])("rejects %j", (input) => {
    expect(safeUrl(input)).toBeUndefined();
  });

  it("accepts and canonicalizes http(s) links", () => {
    expect(safeUrl(" https://www.twitch.tv/videos/123?t=42m ")).toBe("https://www.twitch.tv/videos/123?t=42m");
    expect(safeUrl("https://tracker.gg/valorant/match/abc")).toBe("https://tracker.gg/valorant/match/abc");
  });

  it("encodes IDN hosts as punycode (homograph-visible)", () => {
    const url = safeUrl("https://twitсh.tv/x"); // Cyrillic "с" look-alike
    expect(url).toMatch(/^https:\/\/xn--[a-z0-9-]+\.tv\/x$/);
    expect(url).not.toBe("https://twitch.tv/x");
  });
});

describe("leveling mirrors the contract", () => {
  it("computes integer square roots", () => {
    for (const n of [0n, 1n, 2n, 3n, 4n, 15n, 16n, 17n, 10n ** 40n]) {
      const r = bigSqrt(n);
      expect(r * r <= n && (r + 1n) * (r + 1n) > n).toBe(true);
    }
  });

  it("matches Character.levelForXP", () => {
    expect(levelForXP(0n)).toBe(1);
    expect(levelForXP(99n)).toBe(1);
    expect(levelForXP(100n)).toBe(2);
    expect(levelForXP(1_600n)).toBe(5);
  });
});

describe("clipUrl", () => {
  it("accepts single clips from each platform and drops tracking junk", () => {
    const cases: [string, string, string][] = [
      ["https://www.tiktok.com/@carol.k/video/7300000000000000001?is_from_webapp=1&sender_device=pc", "https://www.tiktok.com/@carol.k/video/7300000000000000001", "tiktok"],
      ["https://vm.tiktok.com/ZMabc123/", "https://vm.tiktok.com/ZMabc123/", "tiktok"],
      ["https://youtube.com/shorts/dQw4w9WgXcQ?feature=share", "https://youtube.com/shorts/dQw4w9WgXcQ", "youtube"],
      ["https://youtu.be/dQw4w9WgXcQ?t=10", "https://youtu.be/dQw4w9WgXcQ", "youtube"],
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
      ["https://clips.twitch.tv/FunnySlug-abc_123", "https://clips.twitch.tv/FunnySlug-abc_123", "twitch"],
      ["https://www.twitch.tv/neon/clip/FunnySlug-abc#t=1", "https://www.twitch.tv/neon/clip/FunnySlug-abc", "twitch"],
      ["https://www.instagram.com/reel/C1a2b3c4d5/?igsh=xyz", "https://www.instagram.com/reel/C1a2b3c4d5", "instagram"],
      ["https://x.com/neon_tv/status/1790000000000000000?s=20", "https://x.com/neon_tv/status/1790000000000000000", "x"],
      ["  https://twitter.com/neon/status/123456789  ", "https://twitter.com/neon/status/123456789", "x"],
    ];
    for (const [raw, url, platform] of cases) expect(clipUrl(raw)).toEqual({ url, platform });
  });

  it("refuses anything else", () => {
    const bidi = String.fromCharCode(0x202e);
    for (const raw of [
      "",
      "http://www.tiktok.com/@a/video/1234567",
      "https://eviltiktok.com/@a/video/1234567",
      "https://tiktok.com.evil.io/@a/video/1234567",
      "https://www.tiktok.com/@a",
      "https://user:pw@www.tiktok.com/@a/video/1234567",
      "https://www.tiktok.com:8443/@a/video/1234567",
      `https://www.tiktok.com/@a/video/1234567${bidi}`,
      "javascript:alert(1)",
      "https://youtube.com/watch?v=short",
      "https://www.instagram.com/p/abc123/",
      "https://x.com/neon/likes",
      "https://example.com/clip.mp4",
      `https://www.tiktok.com/@a/video/${"1".repeat(300)}`,
    ]) {
      expect(clipUrl(raw)).toBeUndefined();
    }
  });
});
