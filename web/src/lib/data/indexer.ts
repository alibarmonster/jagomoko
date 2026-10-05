/**
 * Server-only GraphQL client for the Envio indexer (Hasura). It never runs in the browser: the
 * endpoint and any admin secret stay on the server, and the browser reads through our own
 * /api routes. Everything returned is already a view-model from ./types.
 */
import type { Usd } from "../money";
import type { Activity, Battle, Creator, JuryCase, Player, Proposal, ProtocolStats, Quest, World } from "./types";
import { EMPTY_MINE, type Mine } from "./mine";
import {
  big,
  mapActivity,
  mapBattle,
  mapCreator,
  mapJuryCase,
  mapPlayer,
  mapProposal,
  mapProtocol,
  mapQuest,
  ms,
  type ActivityRow,
  type BattleRow,
  type CreatorRow,
  type JuryCaseRow,
  type PlayerRow,
  type ProposalRow,
  type ProtocolRow,
  type QuestRow,
} from "./mappers";

export class IndexerError extends Error {}

export const indexerConfigured = () => Boolean(process.env.INDEXER_GRAPHQL_URL);

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const url = process.env.INDEXER_GRAPHQL_URL;
  if (!url) throw new IndexerError("INDEXER_GRAPHQL_URL is not set");
  const secret = process.env.INDEXER_GRAPHQL_SECRET;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { "x-hasura-admin-secret": secret } : {}) },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new IndexerError("The live data service is not reachable");
  }
  if (!res.ok) throw new IndexerError(`The live data service answered ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length || !json.data) throw new IndexerError(json.errors?.[0]?.message ?? "Empty answer from the live data service");
  return json.data;
}

// ---- selections ---------------------------------------------------------------------------------

const CREATOR = `id owner handle handleKey creatorBps treasuryBps communityBps pendingCreatorBps pendingTreasuryBps pendingCommunityBps
  pendingEffectiveAt creatorBalance treasuryBalance treasuryInvestedCost communityBalance totalReceived tipCount createdAt`;
const PLAYER = `id name role xp level totalTipped totalBacked totalWon battlesWon juryVotes enlisted createdAt`;
const QUEST = `id creator_id title goalDeadline pool backers status proposedVerdict proposer proofUrl challengeDeadline disputer juryCase_id
  toCreatorVault toTreasury refundable createdAt resolvedAt creator { handle }`;
const BATTLE = `id creator_id question sideA sideB closeTime pointsMode poolA poolB playersA playersB status proposedVerdict proposer proofUrl
  challengeDeadline juryCase_id refundAll toTreasury winnings createdAt resolvedAt creator { handle }`;
const JURY_CASE = `id marketType marketId creator_id jurors deadline yesVotes noVotes resolved verdict`;
const PROPOSAL = `id creator_id proposer kind recipient amount description endsAt forWeight againstWeight voters status createdAt`;
const ACTIVITY = `id creator_id actor kind amount refId text anonymous timestamp txHash`;

const toMap = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));

// ---- one realm ----------------------------------------------------------------------------------

/** The world of one realm, found by the handle in its address. Null if there is no such realm. */
export async function fetchRealm(handleKey: string): Promise<World | null> {
  const first = await gql<{ Creator: (CreatorRow & { moderators: { account: string }[] })[] }>(
    `query Realm($key: String!) {
      Creator(where: { handleKey: { _eq: $key } }, order_by: { createdAt: asc }, limit: 1) {
        ${CREATOR}
        moderators(where: { enabled: { _eq: true } }) { account }
      }
    }`,
    { key: handleKey.toLowerCase() },
  );
  const creatorRow = first.Creator[0];
  if (!creatorRow) return null;

  const lists = await gql<{
    Quest: QuestRow[];
    Battle: BattleRow[];
    Proposal: ProposalRow[];
    JuryCase: JuryCaseRow[];
    Activity: ActivityRow[];
    top: PlayerRow[];
    Protocol: ProtocolRow[];
    done: { aggregate: { count: number } };
  }>(
    `query RealmLists($creator: String!) {
      Quest(where: { creator_id: { _eq: $creator } }, order_by: { createdAt: desc }, limit: 50) { ${QUEST} }
      Battle(where: { creator_id: { _eq: $creator } }, order_by: { createdAt: desc }, limit: 50) { ${BATTLE} }
      Proposal(where: { creator_id: { _eq: $creator } }, order_by: { createdAt: desc }, limit: 30) { ${PROPOSAL} }
      JuryCase(where: { creator_id: { _eq: $creator } }, order_by: { openedAt: desc }, limit: 30) { ${JURY_CASE} }
      Activity(where: { creator_id: { _eq: $creator } }, order_by: { timestamp: desc }, limit: 40) { ${ACTIVITY} }
      top: Player(order_by: { xp: desc }, limit: 100) { ${PLAYER} }
      Protocol(where: { id: { _eq: "global" } }) { creators players totalVolume totalTreasury quests battles }
      done: Quest_aggregate(where: { status: { _eq: "Succeeded" } }) { aggregate { count } }
    }`,
    { creator: creatorRow.id },
  );

  // names for people the lists mention who are not in the top 100
  const have = new Set(lists.top.map((p) => p.id));
  const wanted = new Set<string>();
  for (const a of lists.Activity) if (!have.has(a.actor)) wanted.add(a.actor);
  for (const p of lists.Proposal) {
    if (!have.has(p.recipient)) wanted.add(p.recipient);
    if (!have.has(p.proposer)) wanted.add(p.proposer);
  }
  let extra: PlayerRow[] = [];
  if (wanted.size > 0) {
    extra = (await gql<{ Player: PlayerRow[] }>(`query Extra($ids: [String!]!) { Player(where: { id: { _in: $ids } }) { ${PLAYER} } }`, { ids: [...wanted] })).Player;
  }

  const players: Player[] = [...lists.top, ...extra].map(mapPlayer);
  const byId = toMap(players);
  const names = new Map(players.map((p) => [p.id, p.name]));
  const markets = new Map<string, QuestRow | BattleRow>();
  for (const q of lists.Quest) markets.set(`Quest:${q.id}`, q);
  for (const b of lists.Battle) markets.set(`Battle:${b.id}`, b);

  const creator: Creator = mapCreator(creatorRow);
  return {
    now: Date.now(),
    creator,
    players,
    quests: lists.Quest.map(mapQuest),
    battles: lists.Battle.map(mapBattle),
    juryCases: lists.JuryCase.map((c) => mapJuryCase(c, markets.get(`${c.marketType}:${c.marketId}`))),
    proposals: lists.Proposal.map((p) => mapProposal(p, names)),
    activity: lists.Activity.map((a) => mapActivity(a, byId)),
    protocol: mapProtocol(lists.Protocol[0], lists.done.aggregate.count),
  };
}

// ---- all realms ---------------------------------------------------------------------------------

export interface RealmSummary {
  creator: Creator;
  openQuests: number;
  liveBattles: number;
}

export async function fetchRealms(): Promise<RealmSummary[]> {
  const data = await gql<{
    Creator: (CreatorRow & { openQuests: { aggregate: { count: number } }; liveBattles: { aggregate: { count: number } } })[];
  }>(`{
    Creator(order_by: [{ totalReceived: desc }, { createdAt: asc }], limit: 60) {
      ${CREATOR}
      openQuests: quests_aggregate(where: { status: { _eq: "Open" } }) { aggregate { count } }
      liveBattles: battles_aggregate(where: { status: { _eq: "Open" } }) { aggregate { count } }
    }
  }`);
  return data.Creator.map((c) => ({ creator: mapCreator(c), openQuests: c.openQuests.aggregate.count, liveBattles: c.liveBattles.aggregate.count }));
}

// ---- leaderboard --------------------------------------------------------------------------------

export interface BoardData {
  players: Player[];
  creators: { handle: string; received: Usd; quests: number; supporters: number }[];
}

export async function fetchBoard(): Promise<BoardData> {
  const data = await gql<{
    Player: PlayerRow[];
    Creator: { handle: string; totalReceived: string; tipCount: number; quests: { aggregate: { count: number } } }[];
  }>(`{
    Player(order_by: { xp: desc }, limit: 50) { ${PLAYER} }
    Creator(order_by: { totalReceived: desc }, limit: 20) { handle totalReceived tipCount quests: quests_aggregate { aggregate { count } } }
  }`);
  return {
    players: data.Player.map(mapPlayer),
    creators: data.Creator.map((c) => ({ handle: c.handle, received: big(c.totalReceived), quests: c.quests.aggregate.count, supporters: c.tipCount })),
  };
}

// ---- jury ---------------------------------------------------------------------------------------

export interface JuryData {
  cases: JuryCase[];
  poolSize: number;
}

export async function fetchJury(): Promise<JuryData> {
  const first = await gql<{ JuryCase: JuryCaseRow[]; pool: { aggregate: { count: number } } }>(`{
    JuryCase(order_by: { openedAt: desc }, limit: 60) { ${JURY_CASE} }
    pool: Player_aggregate(where: { enlisted: { _eq: true } }) { aggregate { count } }
  }`);
  const questIds = first.JuryCase.filter((c) => c.marketType === "Quest").map((c) => c.marketId);
  const battleIds = first.JuryCase.filter((c) => c.marketType === "Battle").map((c) => c.marketId);
  const markets = new Map<string, QuestRow | BattleRow>();
  if (questIds.length || battleIds.length) {
    const m = await gql<{ Quest: QuestRow[]; Battle: BattleRow[] }>(
      `query Markets($q: [String!]!, $b: [String!]!) {
        Quest(where: { id: { _in: $q } }) { ${QUEST} }
        Battle(where: { id: { _in: $b } }) { ${BATTLE} }
      }`,
      { q: questIds, b: battleIds },
    );
    for (const q of m.Quest) markets.set(`Quest:${q.id}`, q);
    for (const b of m.Battle) markets.set(`Battle:${b.id}`, b);
  }
  return { cases: first.JuryCase.map((c) => mapJuryCase(c, markets.get(`${c.marketType}:${c.marketId}`))), poolSize: first.pool.aggregate.count };
}

// ---- every market (the "me" page looks up what you took part in) ---------------------------------

export interface MarketsData {
  quests: Quest[];
  battles: Battle[];
  creators: Creator[];
}

export async function fetchMarkets(): Promise<MarketsData> {
  const data = await gql<{ Quest: QuestRow[]; Battle: BattleRow[]; Creator: CreatorRow[] }>(`{
    Quest(order_by: { createdAt: desc }, limit: 200) { ${QUEST} }
    Battle(order_by: { createdAt: desc }, limit: 200) { ${BATTLE} }
    Creator(order_by: { createdAt: asc }, limit: 100) { ${CREATOR} }
  }`);
  return { quests: data.Quest.map(mapQuest), battles: data.Battle.map(mapBattle), creators: data.Creator.map(mapCreator) };
}

// ---- one account's history ----------------------------------------------------------------------

const XP_LABEL: Record<string, string> = {
  Back: "Backed a quest",
  Predict: "Called a battle",
  Jury: "Jury duty",
  Clip: "Clip bounty",
  Tip: "Tip",
  Governance: "Treasury vote",
};

export async function fetchMine(address: string): Promise<Mine> {
  const d = await gql<{
    Backing: { quest_id: string; amount: string; claimed: boolean }[];
    Position: { battle_id: string; side: number; stake: string; claimed: boolean }[];
    JuryVote: { juryCase_id: string; verdict: "Yes" | "No" | "None" | "Invalid" }[];
    ProposalVote: { proposal_id: string; support: boolean }[];
    Quest: { id: string }[];
    Deposit: { amount: string; memo: string; timestamp: string }[];
    XPEvent: { delta: string; kind: string; timestamp: string }[];
    chain_metadata: { latest_processed_block: number }[];
  }>(
    `query Mine($a: String!) {
      Backing(where: { backerAddress: { _eq: $a } }) { quest_id amount claimed }
      Position(where: { playerAddress: { _eq: $a } }) { battle_id side stake claimed }
      JuryVote(where: { juror: { _eq: $a } }) { juryCase_id verdict }
      ProposalVote(where: { voter: { _eq: $a } }) { proposal_id support }
      Quest(where: { disputer: { _eq: $a } }) { id }
      Deposit(where: { from: { _eq: $a } }, order_by: { timestamp: desc }, limit: 40) { amount memo timestamp }
      XPEvent(where: { player_id: { _eq: $a }, delta: { _gt: "0" } }, order_by: { timestamp: desc }, limit: 40) { delta kind timestamp }
      chain_metadata { latest_processed_block }
    }`,
    { a: address },
  );

  const mine: Mine = { ...EMPTY_MINE, backed: {}, picks: {}, claimed: {}, jury: {}, proposalVotes: {}, disputes: {} };
  for (const b of d.Backing) {
    mine.backed[b.quest_id] = big(b.amount);
    if (b.claimed) mine.claimed[`q${b.quest_id}`] = true;
  }
  for (const p of d.Position) {
    mine.picks[p.battle_id] = { side: p.side === 1 ? 1 : 0, amount: big(p.stake) };
    if (p.claimed) mine.claimed[`b${p.battle_id}`] = true;
  }
  for (const v of d.JuryVote) if (v.verdict === "Yes" || v.verdict === "No") mine.jury[v.juryCase_id] = v.verdict === "Yes" ? "yes" : "no";
  for (const v of d.ProposalVote) mine.proposalVotes[v.proposal_id] = v.support;
  for (const q of d.Quest) mine.disputes[q.id] = true;
  mine.tips = d.Deposit.map((t) => ({ amount: big(t.amount), memo: t.memo, at: ms(t.timestamp) }));
  mine.xpLog = d.XPEvent.map((e) => ({ at: ms(e.timestamp), label: XP_LABEL[e.kind] ?? "XP", xp: big(e.delta) }));
  mine.processedBlock = d.chain_metadata[0]?.latest_processed_block ?? 0;
  return mine;
}

// ---- protocol-wide numbers (the front page) -----------------------------------------------------

export async function fetchProtocol(): Promise<ProtocolStats> {
  const d = await gql<{ Protocol: ProtocolRow[]; done: { aggregate: { count: number } } }>(`{
    Protocol(where: { id: { _eq: "global" } }) { creators players totalVolume totalTreasury quests battles }
    done: Quest_aggregate(where: { status: { _eq: "Succeeded" } }) { aggregate { count } }
  }`);
  return mapProtocol(d.Protocol[0], d.done.aggregate.count);
}

// ---- how far behind the indexer is ---------------------------------------------------------------

export async function fetchStatus(): Promise<{ processedBlock: number; height: number }> {
  const d = await gql<{ chain_metadata: { latest_processed_block: number; block_height: number }[] }>(
    `{ chain_metadata { latest_processed_block block_height } }`,
  );
  return { processedBlock: d.chain_metadata[0]?.latest_processed_block ?? 0, height: d.chain_metadata[0]?.block_height ?? 0 };
}

export type { Activity, Proposal, ProtocolStats };
