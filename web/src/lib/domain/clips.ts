/**
 * Clip bounty helpers shared by the guild's Clips page, the studio and the overlay. A bounty takes
 * clips until `submitEnd`, votes until `voteEnd`, and then waits for anyone to settle it.
 */
import type { Bounty, Clip } from "../data/types";
import type { Usd } from "../utils/money";

export type BountyStage = "clips" | "voting" | "settling" | "won" | "refunded";

export function bountyStage(b: Pick<Bounty, "status" | "submitEnd" | "voteEnd">, now: number): BountyStage {
  if (b.status === "Won") return "won";
  if (b.status === "Refunded") return "refunded";
  if (now < b.submitEnd) return "clips";
  if (now < b.voteEnd) return "voting";
  return "settling";
}

/** Everything the winner would take: the creator's part plus the community's. */
export const bountyReward = (b: Pick<Bounty, "escrow" | "communityFunds">): Usd => b.escrow + b.communityFunds;

/**
 * The clips as the page shows them: hidden and refused links left out, most weight first, and on a
 * tie the one sent first (that is how the contract picks the winner).
 */
export function rankClips(clips: Clip[]): Clip[] {
  return clips
    .filter((c) => !c.hidden && c.url)
    .sort((a, b) => (a.weight === b.weight ? Number(BigInt(a.id) - BigInt(b.id)) : a.weight > b.weight ? -1 : 1));
}

export const PLATFORM_LABEL = {
  tiktok: "TikTok",
  youtube: "YouTube",
  twitch: "Twitch",
  instagram: "Instagram",
  x: "X",
} as const;

/**
 * A still for a YouTube clip, from YouTube's own image host (no API call). Other platforms don't
 * offer one without asking their servers, so their cards show our own art instead.
 */
export function youtubeThumb(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const id =
    u.hostname === "youtu.be"
      ? u.pathname.slice(1)
      : (/^\/shorts\/([\w-]{11})$/.exec(u.pathname)?.[1] ?? (u.pathname === "/watch" ? u.searchParams.get("v") : null));
  return id && /^[\w-]{11}$/.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
}
