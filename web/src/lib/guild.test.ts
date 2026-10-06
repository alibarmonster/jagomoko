import { describe, expect, it } from "vitest";
import { bountyReward, bountyStage, rankClips, youtubeThumb } from "./clips";
import type { Clip } from "./data/types";
import { guildRank, guildTag, nextRank } from "./guild";

describe("guildRank", () => {
  it("climbs from Recruit to Veteran by guild XP", () => {
    expect(guildRank(0n)).toBe("Recruit");
    expect(guildRank(99n)).toBe("Recruit");
    expect(guildRank(100n)).toBe("Member");
    expect(guildRank(499n)).toBe("Member");
    expect(guildRank(500n)).toBe("Veteran");
  });

  it("calls the top member the Jago, whatever the XP", () => {
    expect(guildRank(5n, true)).toBe("Jago");
  });

  it("says what is missing for the next rank", () => {
    expect(nextRank(40n)).toEqual({ rank: "Member", missing: 60n });
    expect(nextRank(100n)).toEqual({ rank: "Veteran", missing: 400n });
    expect(nextRank(900n)).toBeNull();
  });
});

describe("guildTag", () => {
  it("is the first four letters of the handle", () => {
    expect(guildTag("neonblade")).toBe("[NEON]");
    expect(guildTag("karambol")).toBe("[KARA]");
    expect(guildTag("a_b")).toBe("[AB]");
    expect(guildTag("__")).toBe("[GLD]");
  });
});

describe("bounties", () => {
  const b = { status: "Open" as const, submitEnd: 1_000, voteEnd: 2_000, escrow: 10n, communityFunds: 20n };

  it("moves from clips to voting to settling, then won or refunded", () => {
    expect(bountyStage(b, 999)).toBe("clips");
    expect(bountyStage(b, 1_000)).toBe("voting");
    expect(bountyStage(b, 2_000)).toBe("settling");
    expect(bountyStage({ ...b, status: "Won" }, 0)).toBe("won");
    expect(bountyStage({ ...b, status: "Refunded" }, 0)).toBe("refunded");
    expect(bountyReward(b)).toBe(30n);
  });

  it("ranks visible clips like the contract: most weight, then the first one sent", () => {
    const clip = (id: string, weight: bigint, extra: Partial<Clip> = {}): Clip => ({
      id,
      bountyId: "1",
      author: "0x",
      authorName: "x",
      url: "https://youtu.be/dQw4w9WgXcQ",
      platform: "youtube",
      weight,
      votes: 1,
      hidden: false,
      won: false,
      createdAt: 0,
      ...extra,
    });
    const ranked = rankClips([clip("1", 10n), clip("2", 20n), clip("3", 20n), clip("4", 99n, { hidden: true }), clip("5", 50n, { url: undefined })]);
    expect(ranked.map((c) => c.id)).toEqual(["2", "3", "1"]);
  });
});

describe("youtubeThumb", () => {
  it("finds the video in every YouTube link shape, and nothing elsewhere", () => {
    const still = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg";
    expect(youtubeThumb("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(still);
    expect(youtubeThumb("https://youtu.be/dQw4w9WgXcQ")).toBe(still);
    expect(youtubeThumb("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(still);
    expect(youtubeThumb("https://www.youtube.com/clip/UgkxAbCdEfGhIjKl")).toBeUndefined();
    expect(youtubeThumb("https://www.tiktok.com/@a/video/1234567")).toBeUndefined();
    expect(youtubeThumb(undefined)).toBeUndefined();
  });
});
