import { describe, expect, it } from "vitest";
import { isOverlayKey, newOverlayKey, OVERLAY_KEY_LENGTH } from "./key";

describe("overlay key", () => {
  it("is 24 random bytes as url-safe text", () => {
    const key = newOverlayKey();
    expect(key).toHaveLength(OVERLAY_KEY_LENGTH);
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(isOverlayKey(key)).toBe(true);
  });

  it("does not repeat", () => {
    const keys = new Set(Array.from({ length: 200 }, () => newOverlayKey()));
    expect(keys.size).toBe(200);
  });

  it("recognises only well-formed keys", () => {
    for (const bad of ["", "short", "x".repeat(31), "x".repeat(33), `${"x".repeat(31)}!`, `${"x".repeat(31)} `, "../".padEnd(32, "x"), null, undefined, 5, {}]) {
      expect(isOverlayKey(bad), String(bad)).toBe(false);
    }
    expect(isOverlayKey("A".repeat(32))).toBe(true);
    expect(isOverlayKey("a-_".padEnd(32, "0"))).toBe(true);
  });
});
