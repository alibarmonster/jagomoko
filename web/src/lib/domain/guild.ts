/**
 * Guild ranks. Guild XP is what a member earned through one creator's actions; the indexer keeps it
 * (indexer/src/lib/guild.ts). The thresholds live here rather than in the index, so they can change
 * without reading the chain again.
 */
import type { Guild, Member } from "../data/types";

export type GuildRank = "Recruit" | "Member" | "Veteran" | "Jago";

/** Guild XP needed for each step. Jago is not a step: it is whoever holds the most. */
export const RANK_XP = { Member: 100n, Veteran: 500n } as const;

export function guildRank(guildXp: bigint, isJago = false): GuildRank {
  if (isJago) return "Jago";
  if (guildXp >= RANK_XP.Veteran) return "Veteran";
  if (guildXp >= RANK_XP.Member) return "Member";
  return "Recruit";
}

export const memberRank = (m: Member, guild: Pick<Guild, "jagoId">): GuildRank => guildRank(m.guildXp, m.id === guild.jagoId);

/** The next rank and the guild XP still missing, or null once a member is a Veteran. */
export function nextRank(guildXp: bigint): { rank: "Member" | "Veteran"; missing: bigint } | null {
  if (guildXp < RANK_XP.Member) return { rank: "Member", missing: RANK_XP.Member - guildXp };
  if (guildXp < RANK_XP.Veteran) return { rank: "Veteran", missing: RANK_XP.Veteran - guildXp };
  return null;
}

/** The short tag shown next to a guild's name, e.g. [NEON] for neonblade. */
export function guildTag(handle: string): string {
  const letters = handle.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
  return `[${letters || "GLD"}]`;
}
