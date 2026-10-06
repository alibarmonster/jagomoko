/**
 * View-model types. They mirror indexer/schema.graphql (ids are strings, money
 * is micro-dollars as bigint, timestamps are epoch milliseconds) so swapping the
 * sample world for the GraphQL client only touches the data layer.
 */
import type { Usd } from "../money";
import type { Role } from "../roles";
import type { Split } from "../outcomes";
import type { ClipPlatform } from "../sanitize";

export type { Role };

export type MarketStatus = "Open" | "Proposed" | "Disputed" | "Succeeded" | "Failed" | "Invalid";
export type Verdict = "None" | "Yes" | "No" | "Invalid";
export type ProposalStatus = "Active" | "Executed" | "Defeated" | "Vetoed";
export type MarketType = "Quest" | "Battle";

export interface Creator extends Split {
  id: string;
  owner: string;
  /** as registered, e.g. "NeonBlade" */
  handle: string;
  /** lowercase, used in URLs: /c/neonblade */
  handleKey: string;
  creatorBalance: Usd;
  treasuryBalance: Usd;
  communityBalance: Usd;
  totalReceived: Usd;
  tipCount: number;
  createdAt: number;
  /** addresses of moderators (live data only) */
  moderators?: string[];
  /** a split change waiting out its 24 hour notice (live data only) */
  pendingSplit?: { split: Split; effectiveAt: number };
}

export interface Player {
  id: string; // address
  name: string;
  role: Role;
  xp: bigint;
  level: number;
  totalTipped: Usd;
  totalBacked: Usd;
  totalWon: Usd;
  battlesWon: number;
  juryVotes: number;
  enlisted: boolean;
  createdAt: number;
}

export interface Quest {
  id: string;
  creatorId: string;
  title: string;
  goalDeadline: number;
  pool: Usd;
  backers: number;
  status: MarketStatus;
  proposedVerdict: Verdict;
  proposer?: string;
  /** validated http(s) URL or undefined — already sanitized by the indexer */
  proofUrl?: string;
  challengeDeadline?: number;
  disputer?: string;
  juryCaseId?: string;
  toCreatorVault: Usd;
  toTreasury: Usd;
  refundable: Usd;
  createdAt: number;
  resolvedAt?: number;
  /** the biggest backers who have a character (live data only), biggest first */
  topBackers?: { id: string; name: string; role: Role }[];
}

export interface Battle {
  id: string;
  creatorId: string;
  question: string;
  sideA: string;
  sideB: string;
  closeTime: number;
  pointsMode: boolean;
  poolA: Usd;
  poolB: Usd;
  playersA: number;
  playersB: number;
  status: MarketStatus;
  proposedVerdict: Verdict;
  proposer?: string;
  proofUrl?: string;
  challengeDeadline?: number;
  juryCaseId?: string;
  refundAll: boolean;
  toTreasury: Usd;
  winnings: Usd;
  createdAt: number;
  resolvedAt?: number;
}

export interface JuryCase {
  id: string;
  marketType: MarketType;
  marketId: string;
  creatorId: string;
  /** the claim being judged, in plain words */
  claim: string;
  proofUrl?: string;
  jurors: number;
  deadline: number;
  yesVotes: number;
  noVotes: number;
  resolved: boolean;
  verdict: Verdict;
}

export interface Proposal {
  id: string;
  creatorId: string;
  /** a spend pays `amount` to `recipient`; an allocation puts `amount` basis points of the treasury to work. Absent means a spend. */
  kind?: "Spend" | "Allocate";
  proposer: string;
  recipient: string;
  recipientName?: string;
  amount: Usd;
  description: string;
  endsAt: number;
  forWeight: bigint;
  againstWeight: bigint;
  voters: number;
  status: ProposalStatus;
  createdAt: number;
}

export type ActivityKind =
  | "CreatorJoined"
  | "CharacterMinted"
  | "Tip"
  | "QuestCreated"
  | "QuestBacked"
  | "QuestProposed"
  | "QuestDisputed"
  | "QuestResolved"
  | "BattleCreated"
  | "BattleJoined"
  | "BattleProposed"
  | "BattleDisputed"
  | "BattleResolved"
  | "JuryCaseOpened"
  | "JuryCaseResolved"
  | "ProposalCreated"
  | "ProposalVoted"
  | "ProposalFinalized"
  | "TreasuryFunded"
  | "TreasurySpent"
  | "TreasuryInvested"
  | "TreasuryDivested"
  | "BountyCreated"
  | "BountyFunded"
  | "ClipSubmitted"
  | "ClipVoted"
  | "BountyWon"
  | "BountyRefunded";

export interface Activity {
  id: string;
  creatorId: string;
  actor: string;
  actorName?: string;
  actorRole?: Role;
  actorLevel?: number;
  kind: ActivityKind;
  amount: Usd;
  refId: string;
  /** already sanitized by the indexer — render as plain text only */
  text: string;
  timestamp: number;
  /** the transaction it happened in (live data only), for a link to the explorer */
  txHash?: string;
  /** a tip whose sender chose to hide their name: shown as "Anonymous", never by account */
  anonymous?: boolean;
}

export interface ProtocolStats {
  creators: number;
  players: number;
  totalVolume: Usd;
  totalTreasury: Usd;
  quests: number;
  battles: number;
  questsCompleted: number;
}

export interface World {
  now: number;
  creator: Creator;
  players: Player[];
  quests: Quest[];
  battles: Battle[];
  juryCases: JuryCase[];
  proposals: Proposal[];
  activity: Activity[];
  protocol: ProtocolStats;
  guild: Guild;
  /** the latest clip bounties, without their clips (see ClipsData) */
  bounties: Bounty[];
}

// ---- guilds -----------------------------------------------------------------------------------------

/** A viewer's standing in one guild. Guild XP is what they earned through this creator's actions. */
export interface Member {
  /** creatorId-address */
  id: string;
  creatorId: string;
  player: { id: string; name: string; role: Role; level: number };
  guildXp: bigint;
  totalTipped: Usd;
  totalBacked: Usd;
  totalPicked: Usd;
  actions: number;
  joinedAt: number;
  lastActiveAt: number;
}

export interface Guild {
  memberCount: number;
  /** the Member id of the guild's Jago: the member with the most guild XP */
  jagoId?: string;
  /** members by guild XP, most first (a guild page gets the top ten) */
  members: Member[];
}

// ---- clip bounties ------------------------------------------------------------------------------------

export type BountyStatus = "Open" | "Won" | "Refunded";

export interface Bounty {
  id: string;
  creatorId: string;
  /** who posted it: the creator or a moderator */
  by: string;
  title: string;
  /** the creator's part, held by the clip board */
  escrow: Usd;
  /** community payouts added to it */
  communityFunds: Usd;
  /** clips close and voting opens */
  submitEnd: number;
  voteEnd: number;
  clipCount: number;
  voteCount: number;
  status: BountyStatus;
  winnerClipId?: string;
  paidOut: Usd;
  createdAt: number;
}

export interface Clip {
  id: string;
  bountyId: string;
  author: string;
  authorName: string;
  authorRole?: Role;
  authorLevel?: number;
  /** a link on an allowed platform, or undefined when the indexer refused it (never shown) */
  url?: string;
  platform?: ClipPlatform;
  /** total sqrt(XP) of its voters */
  weight: bigint;
  votes: number;
  hidden: boolean;
  won: boolean;
  createdAt: number;
}

/** A treasury payout to the clip board: a community-funded pool waiting for (or used by) a bounty. */
export interface ClipPayout {
  proposalId: string;
  amount: Usd;
  description: string;
  status: ProposalStatus;
  endsAt: number;
  forWeight: bigint;
  againstWeight: bigint;
  /** the bounty it was added to */
  attachedTo?: string;
  /** sent back to the treasury unused */
  returned: boolean;
}

/** One guild's clip bounties with their clips, and the community payouts meant for them. */
export interface ClipsData {
  bounties: Bounty[];
  clips: Clip[];
  payouts: ClipPayout[];
}
