/**
 * View-model types. They mirror indexer/schema.graphql (ids are strings, money
 * is micro-dollars as bigint, timestamps are epoch milliseconds) so swapping the
 * sample world for the GraphQL client only touches the data layer.
 */
import type { Usd } from "../money";
import type { Role } from "../roles";
import type { Split } from "../outcomes";

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
  | "TreasurySpent";

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
}
