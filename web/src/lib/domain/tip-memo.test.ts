import { describe, expect, it } from "vitest";
import { ANON_MARKER, tipMemo } from "./tip-memo";

describe("tipMemo", () => {
  it("sends an ordinary message as it is", () => {
    expect(tipMemo("gg wp", false)).toBe("gg wp");
    expect(tipMemo("  gg  ", false)).toBe("gg");
    expect(tipMemo("", false)).toBe("");
  });

  it("puts the marker in front of the message when the name is hidden", () => {
    expect(tipMemo("gg wp", true)).toBe(`${ANON_MARKER} gg wp`);
    expect(tipMemo("", true)).toBe(ANON_MARKER);
    expect(tipMemo("   ", true)).toBe(ANON_MARKER);
  });

  it("does not let a hand-typed marker hide a name when the switch is off", () => {
    expect(tipMemo("[anon] sneaky", false)).toBe("sneaky");
    expect(tipMemo("[ANON]", false)).toBe("");
  });

  it("does not double the marker when the switch is on", () => {
    expect(tipMemo("[anon] hi", true)).toBe(`${ANON_MARKER} hi`);
  });
});
