/**
 * Pure mappers from the indexer's GraphQL rows to the view-models in ./types. No network here, so
 * they are unit-tested with fixtures. Two conversions matter everywhere:
 *  - the indexer stores BigInt as strings and timestamps in SECONDS; the screens want bigint money
 *    and epoch MILLISECONDS
 *  - text fields were already sanitized by the indexer, so they are shown as-is (as plain text)
 */
import type { Role } from "../roles";
import type {
  Activity,
  ActivityKind,
  Battle,
  Creator,
  JuryCase,
  MarketStatus,
  Player,
  Proposal,
  ProposalStatus,
  ProtocolStats,
  Quest,
  Verdict,
} from "./types";

type Big = string | number | null | undefined;

/** What an anonymous tipper is called on every screen. */
export const ANONYMOUS_NAME = "Anonymous";

export const big = (v: Big): bigint => BigInt(v ?? 0);
/** seconds (as the chain and indexer count them) to milliseconds */
export const ms = (v: Big): number => Number(v ?? 0) * 1000;
const msOpt = (v: Big): number | undefined => (v === null || v === undefined ? undefined : ms(v));
const orUndefined = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);

// ---- rows ---------------------------------------------------------------------------------------

export interface CreatorRow {
  id: string;
  owner: string;
  handle: string;
  handleKey: string;
  creatorBps: number;
  treasuryBps: number;
  communityBps: number;
  pendingCreatorBps?: number | null;
  pendingTreasuryBps?: number | null;
  pendingCommunityBps?: number | null;
  pendingEffectiveAt?: Big;
  creatorBalance: Big;
  treasuryBalance: Big;
  treasuryInvestedCost?: Big;
  communityBalance: Big;
  totalReceived: Big;
  tipCount: number;
  createdAt: Big;
  moderators?: { account: string }[];
}

export interface PlayerRow {
  id: string;
  name: string;
  role: Role;
  xp: Big;
  level: number;
  totalTipped: Big;
  totalBacked: Big;
  totalWon: Big;
  battlesWon: number;
  juryVotes: number;
  enlisted: boolean;
  createdAt: Big;
}

export interface QuestRow {
  id: string;
  creator_id: string;
  title: string;
  goalDeadline: Big;
  pool: Big;
  backers: number;
  status: MarketStatus;
  proposedVerdict: Verdict;
  proposer?: string | null;
  proofUrl?: string | null;
  challengeDeadline?: Big;
  disputer?: string | null;
  juryCase_id?: string | null;
  toCreatorVault: Big;
  toTreasury: Big;
  refundable: Big;
  createdAt: Big;
  resolvedAt?: Big;
  creator?: { handle: string } | null;
}

export interface BattleRow {
  id: string;
  creator_id: string;
  question: string;
  sideA: string;
  sideB: string;
  closeTime: Big;
  pointsMode: boolean;
  poolA: Big;
  poolB: Big;
  playersA: number;
  playersB: number;
  status: MarketStatus;
  proposedVerdict: Verdict;
  proposer?: string | null;
  proofUrl?: string | null;
  challengeDeadline?: Big;
  juryCase_id?: string | null;
  refundAll: boolean;
  toTreasury: Big;
  winnings: Big;
  createdAt: Big;
  resolvedAt?: Big;
  creator?: { handle: string } | null;
}

export interface JuryCaseRow {
  id: string;
  marketType: "Quest" | "Battle";
  marketId: string;
  creator_id: string;
  jurors: string[];
  deadline: Big;
  yesVotes: number;
  noVotes: number;
  resolved: boolean;
  verdict: Verdict;
}

export interface ProposalRow {
  id: string;
  creator_id: string;
  proposer: string;
  kind?: "Spend" | "Allocate";
  recipient: string;
  amount: Big;
  description: string;
  endsAt: Big;
  forWeight: Big;
  againstWeight: Big;
  voters: number;
  status: ProposalStatus;
  createdAt: Big;
}

export interface ActivityRow {
  id: string;
  creator_id?: string | null;
  actor: string;
  kind: ActivityKind;
  amount: Big;
  refId: string;
  text: string;
  anonymous?: boolean | null;
  timestamp: Big;
  txHash?: string | null;
}

export interface ProtocolRow {
  creators: number;
  players: number;
  totalVolume: Big;
  totalTreasury: Big;
  quests: number;
  battles: number;
}

// ---- mappers ------------------------------------------------------------------------------------

export function mapCreator(r: CreatorRow): Creator {
  const pendingAt = r.pendingEffectiveAt;
  const hasPending =
    r.pendingCreatorBps !== null &&
    r.pendingCreatorBps !== undefined &&
    r.pendingTreasuryBps !== null &&
    r.pendingTreasuryBps !== undefined &&
    r.pendingCommunityBps !== null &&
    r.pendingCommunityBps !== undefined &&
    pendingAt !== null &&
    pendingAt !== undefined;
  return {
    id: r.id,
    owner: r.owner,
    handle: r.handle,
    handleKey: r.handleKey,
    creatorBps: r.creatorBps,
    treasuryBps: r.treasuryBps,
    communityBps: r.communityBps,
    creatorBalance: big(r.creatorBalance),
    // the indexer tracks the liquid part; money put to work counts at what it cost (earned yield shows once it is pulled back out)
    treasuryBalance: big(r.treasuryBalance) + big(r.treasuryInvestedCost),
    communityBalance: big(r.communityBalance),
    totalReceived: big(r.totalReceived),
    tipCount: r.tipCount,
    createdAt: ms(r.createdAt),
    moderators: r.moderators?.map((m) => m.account),
    pendingSplit: hasPending
      ? {
          split: { creatorBps: r.pendingCreatorBps!, treasuryBps: r.pendingTreasuryBps!, communityBps: r.pendingCommunityBps! },
          effectiveAt: ms(pendingAt),
        }
      : undefined,
  };
}

export function mapPlayer(r: PlayerRow): Player {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    xp: big(r.xp),
    level: r.level,
    totalTipped: big(r.totalTipped),
    totalBacked: big(r.totalBacked),
    totalWon: big(r.totalWon),
    battlesWon: r.battlesWon,
    juryVotes: r.juryVotes,
    enlisted: r.enlisted,
    createdAt: ms(r.createdAt),
  };
}

export function mapQuest(r: QuestRow): Quest {
  return {
    id: r.id,
    creatorId: r.creator_id,
    title: r.title,
    goalDeadline: ms(r.goalDeadline),
    pool: big(r.pool),
    backers: r.backers,
    status: r.status,
    proposedVerdict: r.proposedVerdict,
    proposer: orUndefined(r.proposer),
    proofUrl: orUndefined(r.proofUrl),
    challengeDeadline: msOpt(r.challengeDeadline),
    disputer: orUndefined(r.disputer),
    juryCaseId: orUndefined(r.juryCase_id),
    toCreatorVault: big(r.toCreatorVault),
    toTreasury: big(r.toTreasury),
    refundable: big(r.refundable),
    createdAt: ms(r.createdAt),
    resolvedAt: msOpt(r.resolvedAt),
  };
}

export function mapBattle(r: BattleRow): Battle {
  return {
    id: r.id,
    creatorId: r.creator_id,
    question: r.question,
    sideA: r.sideA,
    sideB: r.sideB,
    closeTime: ms(r.closeTime),
    pointsMode: r.pointsMode,
    poolA: big(r.poolA),
    poolB: big(r.poolB),
    playersA: r.playersA,
    playersB: r.playersB,
    status: r.status,
    proposedVerdict: r.proposedVerdict,
    proposer: orUndefined(r.proposer),
    proofUrl: orUndefined(r.proofUrl),
    challengeDeadline: msOpt(r.challengeDeadline),
    juryCaseId: orUndefined(r.juryCase_id),
    refundAll: r.refundAll,
    toTreasury: big(r.toTreasury),
    winnings: big(r.winnings),
    createdAt: ms(r.createdAt),
    resolvedAt: msOpt(r.resolvedAt),
  };
}

export function mapProposal(r: ProposalRow, names: ReadonlyMap<string, string>): Proposal {
  return {
    id: r.id,
    creatorId: r.creator_id,
    proposer: r.proposer,
    kind: r.kind ?? "Spend",
    recipient: r.recipient,
    recipientName: names.get(r.recipient),
    amount: big(r.amount),
    description: r.description,
    endsAt: ms(r.endsAt),
    forWeight: big(r.forWeight),
    againstWeight: big(r.againstWeight),
    voters: r.voters,
    status: r.status,
    createdAt: ms(r.createdAt),
  };
}

export function mapActivity(r: ActivityRow, players: ReadonlyMap<string, Player>): Activity {
  // an anonymous tip never takes the name, role or level of any player, whatever `actor` holds
  const anonymous = r.anonymous === true;
  const actor = anonymous ? undefined : players.get(r.actor);
  return {
    id: r.id,
    creatorId: r.creator_id ?? "",
    actor: anonymous ? "" : r.actor,
    actorName: anonymous ? ANONYMOUS_NAME : actor?.name,
    actorRole: actor?.role,
    actorLevel: actor?.level,
    anonymous: anonymous || undefined,
    kind: r.kind,
    amount: big(r.amount),
    refId: r.refId,
    text: r.text,
    timestamp: ms(r.timestamp),
    txHash: r.txHash ?? undefined,
  };
}

export function mapProtocol(r: ProtocolRow | undefined, questsCompleted: number): ProtocolStats {
  return {
    creators: r?.creators ?? 0,
    players: r?.players ?? 0,
    totalVolume: big(r?.totalVolume),
    totalTreasury: big(r?.totalTreasury),
    quests: r?.quests ?? 0,
    battles: r?.battles ?? 0,
    questsCompleted,
  };
}

/**
 * The plain-words claim a jury is asked to judge. It is what the creator reported, so the jury
 * decides whether to believe it. `market` is the quest or battle the case is about.
 */
export function mapJuryCase(r: JuryCaseRow, market: (QuestRow | BattleRow) | undefined): JuryCase {
  const who = market?.creator?.handle ?? "The creator";
  let claim = `${who} reported a result.`;
  let proofUrl: string | undefined;
  if (market && r.marketType === "Quest") {
    const q = market as QuestRow;
    claim = `${who} says “${q.title}” ${q.proposedVerdict === "Yes" ? "was completed" : "failed"}.`;
    proofUrl = orUndefined(q.proofUrl);
  } else if (market && r.marketType === "Battle") {
    const b = market as BattleRow;
    claim = `${who} says ${b.proposedVerdict === "Yes" ? b.sideA : b.sideB} won “${b.question}”.`;
    proofUrl = orUndefined(b.proofUrl);
  }
  return {
    id: r.id,
    marketType: r.marketType,
    marketId: r.marketId,
    creatorId: r.creator_id,
    claim,
    proofUrl,
    jurors: r.jurors.length,
    deadline: ms(r.deadline),
    yesVotes: r.yesVotes,
    noVotes: r.noVotes,
    resolved: r.resolved,
    verdict: r.verdict,
  };
}
