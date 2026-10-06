/**
 * Server-only GraphQL client for the Envio indexer (Hasura). It never runs in the browser: the
 * endpoint and any admin secret stay on the server, and the browser reads through our own
 * /api routes. Everything returned is already a view-model from ./types.
 */
import { getAddress, isAddress } from "viem";
import deployment from "../chain/deployment.json";
import type { Usd } from "../utils/money";
import { applyNames, displayName, type NameBook } from "../profile/name";
import { nameBook } from "../server/profiles";
import type { Activity, Battle, Bounty, ClipsData, Creator, Guild, JuryCase, Member, Player, Proposal, ProtocolStats, Quest, World } from "./types";
import { EMPTY_MINE, type Mine } from "./mine";
import {
  big,
  mapActivity,
  mapBattle,
  mapBounty,
  mapClip,
  mapCreator,
  mapJuryCase,
  mapMember,
  mapPayout,
  mapPlayer,
  mapProposal,
  mapProtocol,
  mapQuest,
  ms,
  type ActivityRow,
  type BattleRow,
  type BountyRow,
  type ClipRow,
  type CreatorRow,
  type JuryCaseRow,
  type MemberRow,
  type NameOf,
  type PayoutRow,
  type PersonRow,
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

const MEMBER = `id creator_id guildXp totalTipped totalBacked totalPicked actions joinedAt lastActiveAt player { id name role level }`;
const BOUNTY = `id creator_id by title escrow communityFunds submitEnd voteEnd clipCount voteCount status winner_id paidOut createdAt`;
const CLIP = `id bounty_id author url platform weight votes hidden won createdAt authorPlayer { id name role level }`;

const toMap = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));

/** The name a viewer chose (kept off chain), else the on-chain stand-in. */
const namesFrom = (book: NameBook): NameOf => (p: PersonRow) => displayName(p, book);

// Guilds and clip bounties came with a schema change: an index from before it answers with an error
// for them. Those reads fall back to empty instead of taking the whole page down with them.
const warned = new Set<string>();
async function optional<T>(what: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!warned.has(what)) {
      warned.add(what);
      console.warn(`Live data: no ${what} yet (has the indexer been re-synced with the guild schema?)`, error instanceof Error ? error.message : error);
    }
    return fallback;
  }
}

export const EMPTY_GUILD: Guild = { memberCount: 0, members: [] };

async function fetchGuild(creatorId: string, names: NameOf, limit: number): Promise<Guild> {
  const d = await gql<{ Creator: { memberCount: number; jago_id?: string | null }[]; Member: MemberRow[] }>(
    `query Guild($creator: String!, $limit: Int!) {
      Creator(where: { id: { _eq: $creator } }) { memberCount jago_id }
      Member(where: { creator_id: { _eq: $creator } }, order_by: [{ guildXp: desc }, { joinedAt: asc }], limit: $limit) { ${MEMBER} }
    }`,
    { creator: creatorId, limit },
  );
  const c = d.Creator[0];
  return {
    memberCount: c?.memberCount ?? 0,
    jagoId: c?.jago_id ?? undefined,
    members: d.Member.map((m) => mapMember(m, names)).filter((m): m is Member => m !== null),
  };
}

/** The biggest backers with a character, per quest (the faces on a quest card). */
async function fetchTopBackers(questIds: string[], names: NameOf): Promise<Map<string, NonNullable<Quest["topBackers"]>>> {
  const out = new Map<string, NonNullable<Quest["topBackers"]>>();
  if (questIds.length === 0) return out;
  const d = await gql<{ Backing: { quest_id: string; backer?: PersonRow | null }[] }>(
    `query Backers($ids: [String!]!) {
      Backing(where: { quest_id: { _in: $ids }, backer_id: { _is_null: false } }, order_by: { amount: desc }, limit: 400) { quest_id backer { id name role level } }
    }`,
    { ids: questIds },
  );
  for (const b of d.Backing) {
    if (!b.backer) continue;
    const list = out.get(b.quest_id) ?? [];
    if (list.length < 4) list.push({ id: b.backer.id, name: names(b.backer), role: b.backer.role });
    out.set(b.quest_id, list);
  }
  return out;
}

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

  // names are kept off chain: put each player's chosen name in place of the on-chain stand-in
  const book = await nameBook();
  const names = namesFrom(book);
  const players: Player[] = applyNames([...lists.top, ...extra].map(mapPlayer), book);
  const byId = toMap(players);
  const nameMap = new Map(players.map((p) => [p.id, p.name]));
  const markets = new Map<string, QuestRow | BattleRow>();
  for (const q of lists.Quest) markets.set(`Quest:${q.id}`, q);
  for (const b of lists.Battle) markets.set(`Battle:${b.id}`, b);

  const [guild, bounties, backers, via] = await Promise.all([
    optional("guild", () => fetchGuild(creatorRow.id, names, 10), EMPTY_GUILD),
    optional("clip bounties", () => fetchBounties(creatorRow.id, 10), [] as Bounty[]),
    optional(
      "quest backers",
      () =>
        fetchTopBackers(
          lists.Quest.map((q) => q.id),
          names,
        ),
      new Map<string, NonNullable<Quest["topBackers"]>>(),
    ),
    optional("cross-chain tips", () => fetchVia(lists.Activity.map((a) => a.id)), new Map<string, number>()),
  ]);

  const creator: Creator = mapCreator(creatorRow);
  return {
    now: Date.now(),
    creator,
    players,
    quests: lists.Quest.map((q) => ({ ...mapQuest(q), topBackers: backers.get(q.id) ?? [] })),
    battles: lists.Battle.map(mapBattle),
    juryCases: lists.JuryCase.map((c) => mapJuryCase(c, markets.get(`${c.marketType}:${c.marketId}`))),
    proposals: lists.Proposal.map((p) => mapProposal(p, nameMap)),
    activity: lists.Activity.map((a) => mapActivity({ ...a, via: via.get(a.id) }, byId)),
    protocol: mapProtocol(lists.Protocol[0], lists.done.aggregate.count),
    guild,
    bounties,
  };
}

/** Which of these activities were tips paid on another chain, and from where (v2 schema only). */
async function fetchVia(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const d = await gql<{ Activity: { id: string; via?: number | null }[] }>(
    `query Via($ids: [String!]!) { Activity(where: { id: { _in: $ids }, via: { _is_null: false } }) { id via } }`,
    { ids },
  );
  return new Map(d.Activity.flatMap((a) => (typeof a.via === "number" ? [[a.id, a.via] as const] : [])));
}

/** Where a cross-chain tip stands on Monad, by its LayerZero guid: credited, bounced, or not here yet. */
export async function fetchTipLanding(guid: string): Promise<{ status: "landed" | "bounced" | "pending"; txHash?: string }> {
  const d = await gql<{ Deposit: { txHash: string }[]; Activity: { txHash: string }[] }>(
    `query Landing($guid: String!) {
      Deposit(where: { lzGuid: { _eq: $guid } }, limit: 1) { txHash }
      Activity(where: { kind: { _eq: "TipBounced" }, refId: { _eq: $guid } }, limit: 1) { txHash }
    }`,
    { guid },
  );
  if (d.Deposit[0]) return { status: "landed", txHash: d.Deposit[0].txHash };
  if (d.Activity[0]) return { status: "bounced", txHash: d.Activity[0].txHash };
  return { status: "pending" };
}

async function fetchBounties(creatorId: string, limit: number): Promise<Bounty[]> {
  const d = await gql<{ Bounty: BountyRow[] }>(
    `query Bounties($creator: String!, $limit: Int!) { Bounty(where: { creator_id: { _eq: $creator } }, order_by: { createdAt: desc }, limit: $limit) { ${BOUNTY} } }`,
    { creator: creatorId, limit },
  );
  return d.Bounty.map(mapBounty);
}

/** The id of the guild with this handle, or null. */
async function creatorIdOf(handleKey: string): Promise<string | null> {
  const d = await gql<{ Creator: { id: string }[] }>(
    `query Id($key: String!) { Creator(where: { handleKey: { _eq: $key } }, order_by: { createdAt: asc }, limit: 1) { id } }`,
    { key: handleKey.toLowerCase() },
  );
  return d.Creator[0]?.id ?? null;
}

// ---- one guild: its members -----------------------------------------------------------------------

/** Everyone in a guild (the first 100 by guild XP). Null if there is no such guild. */
export async function fetchMembers(handleKey: string): Promise<Guild | null> {
  const id = await creatorIdOf(handleKey);
  if (id === null) return null;
  const names = namesFrom(await nameBook());
  return optional("guild", () => fetchGuild(id, names, 100), EMPTY_GUILD);
}

// ---- one guild: its clip bounties ---------------------------------------------------------------------

export const EMPTY_CLIPS: ClipsData = { bounties: [], clips: [], payouts: [] };

// read straight from the deployment file: chain/config would pull every chain viem knows into this module
const deployedBoard = (deployment.contracts as Record<string, string | undefined>).ClipBoard;
const CLIP_BOARD = deployedBoard && isAddress(deployedBoard, { strict: false }) ? getAddress(deployedBoard) : "0x0000000000000000000000000000000000000000";

/** The bounties of a guild with their clips, and the community payouts meant for them. Null if there is no such guild. */
export async function fetchClips(handleKey: string): Promise<ClipsData | null> {
  const id = await creatorIdOf(handleKey);
  if (id === null) return null;
  const names = namesFrom(await nameBook());
  return optional(
    "clip bounties",
    async () => {
      const d = await gql<{ Bounty: BountyRow[]; Clip: ClipRow[]; Proposal: PayoutRow[] }>(
        `query Clips($creator: String!, $board: String!) {
          Bounty(where: { creator_id: { _eq: $creator } }, order_by: { createdAt: desc }, limit: 20) { ${BOUNTY} }
          Clip(where: { bounty: { creator_id: { _eq: $creator } } }, order_by: { createdAt: asc }, limit: 500) { ${CLIP} }
          Proposal(where: { creator_id: { _eq: $creator }, recipient: { _eq: $board } }, order_by: { createdAt: desc }, limit: 20) { ${PROPOSAL} attachedTo_id returned }
        }`,
        // before ClipBoard is deployed nothing can pay it, so the payout list is simply empty
        { creator: id, board: CLIP_BOARD },
      );
      return { bounties: d.Bounty.map(mapBounty), clips: d.Clip.map((c) => mapClip(c, names)), payouts: d.Proposal.map(mapPayout) };
    },
    EMPTY_CLIPS,
  );
}

// ---- all realms ---------------------------------------------------------------------------------

export interface RealmSummary {
  creator: Creator;
  openQuests: number;
  liveBattles: number;
  /** viewers who joined the guild (0 before the guild schema) */
  members: number;
}

/** Member counts per guild id; empty before the guild schema. */
async function memberCounts(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  return optional(
    "member counts",
    async () => {
      const d = await gql<{ Creator: { id: string; memberCount: number }[] }>(
        `query Members($ids: [String!]!) { Creator(where: { id: { _in: $ids } }) { id memberCount } }`,
        { ids },
      );
      return new Map(d.Creator.map((c) => [c.id, c.memberCount]));
    },
    new Map<string, number>(),
  );
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
  const members = await memberCounts(data.Creator.map((c) => c.id));
  return data.Creator.map((c) => ({
    creator: mapCreator(c),
    openQuests: c.openQuests.aggregate.count,
    liveBattles: c.liveBattles.aggregate.count,
    members: members.get(c.id) ?? 0,
  }));
}

// ---- leaderboard --------------------------------------------------------------------------------

export interface BoardData {
  players: Player[];
  creators: { handle: string; received: Usd; quests: number; supporters: number; members: number }[];
}

export async function fetchBoard(): Promise<BoardData> {
  const data = await gql<{
    Player: PlayerRow[];
    Creator: { id: string; handle: string; totalReceived: string; tipCount: number; quests: { aggregate: { count: number } } }[];
  }>(`{
    Player(order_by: { xp: desc }, limit: 50) { ${PLAYER} }
    Creator(order_by: { totalReceived: desc }, limit: 20) { id handle totalReceived tipCount quests: quests_aggregate { aggregate { count } } }
  }`);
  const members = await memberCounts(data.Creator.map((c) => c.id));
  return {
    players: applyNames(data.Player.map(mapPlayer), await nameBook()),
    creators: data.Creator.map((c) => ({
      handle: c.handle,
      received: big(c.totalReceived),
      quests: c.quests.aggregate.count,
      supporters: c.tipCount,
      members: members.get(c.id) ?? 0,
    })),
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
  Object.assign(mine, await optional("guild memberships", () => fetchMyGuilds(address), { guilds: [], clipVotes: {}, clipsSent: {} }));
  mine.xpLog = d.XPEvent.map((e) => ({ at: ms(e.timestamp), label: XP_LABEL[e.kind] ?? "XP", xp: big(e.delta) }));
  mine.processedBlock = d.chain_metadata[0]?.latest_processed_block ?? 0;
  return mine;
}

/** The guilds an account is in, the clip it voted for in each bounty, and the clips it sent. */
async function fetchMyGuilds(address: string): Promise<Pick<Mine, "guilds" | "clipVotes" | "clipsSent">> {
  const d = await gql<{
    Member: { id: string; creator_id: string; guildXp: string; creator: { handle: string; handleKey: string; memberCount: number; jago_id?: string | null } }[];
    ClipVote: { bountyId: string; clip_id: string }[];
    Clip: { id: string; bounty_id: string }[];
  }>(
    `query MyGuilds($a: String!) {
      Member(where: { player_id: { _eq: $a } }, order_by: { guildXp: desc }, limit: 50) { id creator_id guildXp creator { handle handleKey memberCount jago_id } }
      ClipVote(where: { voter: { _eq: $a } }, limit: 200) { bountyId clip_id }
      Clip(where: { author: { _eq: $a } }, limit: 200) { id bounty_id }
    }`,
    { a: address },
  );
  return {
    guilds: d.Member.map((m) => ({
      memberId: m.id,
      creatorId: m.creator_id,
      handle: m.creator.handle,
      handleKey: m.creator.handleKey,
      guildXp: big(m.guildXp),
      memberCount: m.creator.memberCount,
      isJago: m.creator.jago_id === m.id,
    })),
    clipVotes: Object.fromEntries(d.ClipVote.map((v) => [v.bountyId, v.clip_id])),
    clipsSent: Object.fromEntries(d.Clip.map((c) => [c.bounty_id, c.id])),
  };
}

// ---- protocol-wide numbers (the front page) -----------------------------------------------------

export async function fetchProtocol(): Promise<ProtocolStats> {
  const d = await gql<{ Protocol: ProtocolRow[]; done: { aggregate: { count: number } } }>(`{
    Protocol(where: { id: { _eq: "global" } }) { creators players totalVolume totalTreasury quests battles }
    done: Quest_aggregate(where: { status: { _eq: "Succeeded" } }) { aggregate { count } }
  }`);
  return mapProtocol(d.Protocol[0], d.done.aggregate.count);
}

// ---- names ----------------------------------------------------------------------------------------

/** True if a guild already goes by this handle (lowercase key), so no viewer can take it as a name. */
export async function handleTaken(key: string): Promise<boolean> {
  const d = await gql<{ Creator: { id: string }[] }>(`query Handle($key: String!) { Creator(where: { handleKey: { _eq: $key } }, limit: 1) { id } }`, { key });
  return d.Creator.length > 0;
}

// ---- how far behind the indexer is ---------------------------------------------------------------

export async function fetchStatus(): Promise<{ processedBlock: number; height: number }> {
  const d = await gql<{ chain_metadata: { latest_processed_block: number; block_height: number }[] }>(
    `{ chain_metadata { latest_processed_block block_height } }`,
  );
  return { processedBlock: d.chain_metadata[0]?.latest_processed_block ?? 0, height: d.chain_metadata[0]?.block_height ?? 0 };
}

export type { Activity, Proposal, ProtocolStats };
