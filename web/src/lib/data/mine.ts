import type { Usd } from "../utils/money";

/**
 * Everything one account has done, as the indexer sees it. This is what "my backed quests", the
 * claim buttons, "you voted" and the XP list read from, so they are true on any device and not
 * just in the browser that made the move.
 */
export interface Mine {
  /** questId -> total this account put in */
  backed: Record<string, Usd>;
  /** battleId -> the side picked and the stake */
  picks: Record<string, { side: 0 | 1; amount: Usd }>;
  /** "q<id>" or "b<id>" once the claim was taken */
  claimed: Record<string, true>;
  /** caseId -> how this account voted as a juror */
  jury: Record<string, "yes" | "no">;
  /** proposalId -> for (true) or against (false) */
  proposalVotes: Record<string, boolean>;
  /** quests this account sent to a jury */
  disputes: Record<string, true>;
  tips: { amount: Usd; memo: string; at: number }[];
  xpLog: { at: number; label: string; xp: bigint }[];
  /** the guilds this account is a member of, most guild XP first */
  guilds: MyGuild[];
  /** bountyId -> the clip this account voted for */
  clipVotes: Record<string, string>;
  /** bountyId -> the clip this account sent */
  clipsSent: Record<string, string>;
  /** the last block the indexer has processed when this was read */
  processedBlock: number;
}

export interface MyGuild {
  memberId: string;
  creatorId: string;
  handle: string;
  handleKey: string;
  guildXp: bigint;
  memberCount: number;
  isJago: boolean;
}

export const EMPTY_MINE: Mine = {
  backed: {},
  picks: {},
  claimed: {},
  jury: {},
  proposalVotes: {},
  disputes: {},
  tips: [],
  xpLog: [],
  guilds: [],
  clipVotes: {},
  clipsSent: {},
  processedBlock: 0,
};
