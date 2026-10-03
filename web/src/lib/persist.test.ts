import { describe, expect, it } from "vitest";
import { parse, stringify } from "./persist";

describe("persist", () => {
  it("round-trips bigint values nested anywhere", () => {
    const value = { balance: 10_000_000n, character: { xp: 75n, name: "Tester" }, backed: { "1": 5_000_000n }, list: [1n, 2n] };
    expect(parse<typeof value>(stringify(value))).toEqual(value);
  });

  it("leaves plain numbers and strings alone", () => {
    expect(parse<{ a: number; b: string }>(stringify({ a: 1, b: "x" }))).toEqual({ a: 1, b: "x" });
  });

  it("returns null on corrupt input instead of throwing", () => {
    expect(parse("{not json")).toBeNull();
  });
});
