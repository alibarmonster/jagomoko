import { describe, expect, it } from "vitest";
import { ANON_MARKER, readTipMemo } from "../src/lib/tip-memo.js";

describe("readTipMemo", () => {
  it("leaves an ordinary message alone", () => {
    expect(readTipMemo("gg wp")).toEqual({ anonymous: false, memo: "gg wp", changed: false });
    expect(readTipMemo("")).toEqual({ anonymous: false, memo: "", changed: false });
  });

  it("reads the marker and removes it from the message", () => {
    expect(readTipMemo(`${ANON_MARKER} gg wp`)).toMatchObject({ anonymous: true, memo: "gg wp" });
    expect(readTipMemo(ANON_MARKER)).toMatchObject({ anonymous: true, memo: "" });
  });

  it("accepts the marker in any case and after leading spaces", () => {
    expect(readTipMemo("  [ANON]nice").anonymous).toBe(true);
    expect(readTipMemo("[Anon]\tnice")).toMatchObject({ anonymous: true, memo: "nice" });
  });

  it("only counts the marker at the very start", () => {
    expect(readTipMemo("hello [anon]")).toMatchObject({ anonymous: false, memo: "hello [anon]" });
    expect(readTipMemo("[anonymous] hi")).toMatchObject({ anonymous: false });
  });

  it("applies the 140-character limit to the message alone, not the marker", () => {
    const long = "x".repeat(300);
    const out = readTipMemo(`${ANON_MARKER}${long}`);
    expect(out.anonymous).toBe(true);
    expect(Array.from(out.memo)).toHaveLength(140);
  });

  it("still cleans hostile text after the marker", () => {
    expect(readTipMemo("[anon]gg ‮wp").memo).toBe("gg wp");
  });

  it("copes with non-string input", () => {
    expect(readTipMemo(undefined as unknown as string)).toMatchObject({ anonymous: false, memo: "" });
  });
});
