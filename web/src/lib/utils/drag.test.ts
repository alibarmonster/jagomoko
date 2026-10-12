import { describe, expect, it } from "vitest";
import { progressOf, slideCommits, squash, switchLands } from "./drag";

describe("drag helpers", () => {
  it("measures progress along the track, clamped", () => {
    expect(progressOf(50, 200)).toBe(0.25);
    expect(progressOf(-10, 200)).toBe(0);
    expect(progressOf(400, 200)).toBe(1);
    expect(progressOf(10, 0)).toBe(0);
  });

  it("commits a slide only near the end", () => {
    expect(slideCommits(170, 200)).toBe(false);
    expect(slideCommits(180, 200)).toBe(true);
    expect(slideCommits(250, 200)).toBe(true);
  });

  it("stretches with speed, up to the limit, and keeps the area", () => {
    expect(squash(0, 0.35)).toEqual({ sx: 1, sy: 1 });
    const fast = squash(-9, 0.35);
    expect(fast.sx).toBeCloseTo(1.35);
    expect(fast.sx * fast.sy).toBeCloseTo(1);
    expect(squash(0.75, 0.35).sx).toBeCloseTo(1.175);
  });

  it("flips a switch on a tap and lands a drag on the nearer side", () => {
    expect(switchLands(0, 20, false, false)).toBe(true);
    expect(switchLands(20, 20, true, false)).toBe(false);
    expect(switchLands(12, 20, false, true)).toBe(true);
    expect(switchLands(8, 20, true, true)).toBe(false);
  });
});
