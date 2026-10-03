import { describe, expect, it } from "vitest";
import { cleanText, safeUrl } from "./sanitize";
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
