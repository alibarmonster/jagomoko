import { describe, expect, it } from "vitest";
import { cleanText, clipUrl, safeUrl } from "./sanitize";
import { proofDomain } from "./format";

// Mirrors indexer/test/sanitize.test.ts: what you see while typing is what the public record shows.
describe("cleanText", () => {
  it("strips bidi overrides used for spoofing", () => {
    expect(cleanText("admin\u202Egnp.exe", 32).value).toBe("admingnp.exe");
  });
  it("removes zero-width and tag characters", () => {
    expect(cleanText("ali\u200Bce\uFEFF\u2060", 32).value).toBe("alice");
    expect(cleanText("\u{E0041}tag", 32).value).toBe("tag");
  });
  it("removes control characters and collapses whitespace", () => {
    expect(cleanText("a\u0000b\u0007\tc \n\r d", 32).value).toBe("ab c d");
  });
  it("keeps paragraphs only in multiline mode", () => {
    expect(cleanText("l1\n\n\n\nl2", 100, { multiline: true }).value).toBe("l1\n\nl2");
    expect(cleanText("l1\nl2", 100).value).toBe("l1 l2");
  });
  it("caps combining-mark stacks", () => {
    expect(Array.from(cleanText("Z" + "\u0301".repeat(50), 100).value)).toHaveLength(4);
  });
  it("truncates by code point without splitting emoji", () => {
    const r = cleanText("\u{1F600}".repeat(30), 10);
    expect(Array.from(r.value)).toHaveLength(10);
    expect(r.value.endsWith("…")).toBe(true);
  });
  it("normalizes full-width look-alikes", () => {
    expect(cleanText("\uFF41\uFF44\uFF4D\uFF49\uFF4E", 32).value).toBe("admin");
  });
  it("is safe on non-string input", () => {
    expect(cleanText(undefined as unknown as string, 10).value).toBe("");
  });
});

describe("safeUrl", () => {
  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "  javascript:alert(document.cookie)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "https://user:pass@evil.com",
    "http://localhost:3000",
    "https://twitch.tv/\nvod",
    "https://twit\u200Bch.tv/vod",
    "not a url",
    "",
  ])("rejects %j", (input) => {
    expect(safeUrl(input)).toBeUndefined();
  });

  it("accepts and canonicalizes http(s) links", () => {
    expect(safeUrl(" https://www.twitch.tv/videos/123?t=42m ")).toBe("https://www.twitch.tv/videos/123?t=42m");
  });
});

describe("proofDomain", () => {
  it("shows only the domain", () => {
    expect(proofDomain("https://www.twitch.tv/videos/1?t=42m")).toBe("twitch.tv");
    expect(proofDomain("https://tracker.gg/valorant/match/abc")).toBe("tracker.gg");
  });
  it("returns null for anything that is not http(s)", () => {
    expect(proofDomain("javascript:alert(1)")).toBeNull();
    expect(proofDomain(undefined)).toBeNull();
    expect(proofDomain("nonsense")).toBeNull();
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
