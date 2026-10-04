import { describe, expect, it } from "vitest";
import { HANDLE_MAX, normalizeHandleInput, validateHandle } from "./handle";

describe("validateHandle", () => {
  it("accepts lowercase letters, numbers and underscores from 2 to 32 characters", () => {
    for (const ok of ["ab", "karambol", "neon_blade", "ninja99", "_x", "a".repeat(HANDLE_MAX)]) {
      expect(validateHandle(ok)).toEqual({ ok: true, handle: ok });
    }
  });

  it("lowercases and trims, so case variants cannot become separate realms", () => {
    expect(validateHandle("  Karambol ")).toEqual({ ok: true, handle: "karambol" });
    expect(validateHandle("NEON_Blade")).toEqual({ ok: true, handle: "neon_blade" });
  });

  it("rejects what is too short or too long", () => {
    expect(validateHandle("a")).toMatchObject({ ok: false });
    expect(validateHandle("")).toMatchObject({ ok: false });
    expect(validateHandle("a".repeat(HANDLE_MAX + 1))).toMatchObject({ ok: false });
  });

  it("rejects anything that would break an address or look like someone else", () => {
    const accent = String.fromCharCode(0xe9);
    const zeroWidth = String.fromCharCode(0x200b);
    for (const bad of ["has space", "dash-ed", "dot.ted", "slash/x", "emoji😀", `caf${accent}`, `a${zeroWidth}b`, "../x", "x?y=1", "x#y", "<b>"]) {
      expect(validateHandle(bad), bad).toMatchObject({ ok: false });
    }
  });
});

describe("normalizeHandleInput", () => {
  it("keeps typing smooth: lowercases and drops rejected characters", () => {
    expect(normalizeHandleInput("Neon Blade!")).toBe("neonblade");
    expect(normalizeHandleInput("a-b.c")).toBe("abc");
  });

  it("never exceeds the maximum", () => {
    expect(normalizeHandleInput("x".repeat(100))).toHaveLength(HANDLE_MAX);
  });
});
