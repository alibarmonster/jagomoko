import type { Activity, EvmOnEventContext, Player, Protocol, Quest } from "envio";

export type Ctx = EvmOnEventContext;
type ActivityKind = Activity["kind"];
type MarketStatus = Quest["status"];
type Verdict = Quest["proposedVerdict"];

/** Block/tx fields every handler reads (for timestamps and links to the explorer). */
export const FIELDS = { block: ["timestamp"], transaction: ["hash"] } as const;

export type EventMeta = {
  chainId: number;
  logIndex: number;
  block: { number: number; timestamp: number };
  transaction: { hash: string };
};

// ---------------------------------------------------------------------------
// enum decoding — values come from uint8 event params; anything out of range
// is a contract/ABI mismatch, so fail loudly instead of storing garbage.

const ROLES: readonly Player["role"][] = ["Knight", "Seer", "Judge", "Bard"];
const XP_KINDS = ["Back", "Predict", "Jury", "Clip", "Tip", "Governance"] as const;
const VERDICTS: readonly Verdict[] = ["None", "Yes", "No", "Invalid"];
const PROPOSAL_STATUS = ["Active", "Executed", "Defeated", "Vetoed"] as const;
const PROPOSAL_KINDS = ["Spend", "Allocate"] as const;

function decode<T>(table: readonly T[], raw: bigint, what: string): T {
  const v = table[Number(raw)];
  if (raw < 0n || v === undefined) throw new Error(`Unknown ${what} value ${raw}`);
  return v;
}

export const toRole = (raw: bigint) => decode(ROLES, raw, "Role");
export const toXPKind = (raw: bigint) => decode(XP_KINDS, raw, "XPKind");
export const toVerdict = (raw: bigint) => decode(VERDICTS, raw, "Verdict");
export const toProposalStatus = (raw: bigint) => decode(PROPOSAL_STATUS, raw, "ProposalStatus");
export const toProposalKind = (raw: bigint) => decode(PROPOSAL_KINDS, raw, "ProposalKind");

/** Resolved verdict -> market status (Yes = quest success / battle side A). */
export function statusFor(verdict: Verdict): MarketStatus {
  switch (verdict) {
    case "Yes":
      return "Succeeded";
    case "No":
      return "Failed";
    case "Invalid":
      return "Invalid";
    default:
      throw new Error("Market cannot resolve to None");
  }
}

/** uint16/uint8 params arrive as bigint; narrow safely to a JS number. */
export function smallInt(raw: bigint, max = 0xffff): number {
  if (raw < 0n || raw > BigInt(max)) throw new Error(`Value ${raw} out of range`);
  return Number(raw);
}

// ---------------------------------------------------------------------------
// leveling — mirrors Character.levelForXP: level = floor(sqrt(xp / 100)) + 1

export function bigSqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("sqrt of negative");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

export function levelForXP(xp: bigint): number {
  return Number(bigSqrt(xp / 100n)) + 1;
}

// ---------------------------------------------------------------------------
// ids

export const eventId = (e: EventMeta) => `${e.block.number}-${e.logIndex}`;
export const pairId = (a: bigint | string, b: string) => `${a.toString()}-${b}`;

// ---------------------------------------------------------------------------
// aggregates

const PROTOCOL_ID = "global";

export async function bumpProtocol(context: Ctx, patch: Partial<Omit<Protocol, "id">>) {
  const p = await context.Protocol.getOrCreate({
    id: PROTOCOL_ID,
    creators: 0,
    players: 0,
    totalVolume: 0n,
    totalTreasury: 0n,
    quests: 0,
    battles: 0,
  });
  context.Protocol.set({
    ...p,
    creators: p.creators + (patch.creators ?? 0),
    players: p.players + (patch.players ?? 0),
    totalVolume: p.totalVolume + (patch.totalVolume ?? 0n),
    totalTreasury: p.totalTreasury + (patch.totalTreasury ?? 0n),
    quests: p.quests + (patch.quests ?? 0),
    battles: p.battles + (patch.battles ?? 0),
  });
}

export function recordActivity(
  context: Ctx,
  e: EventMeta,
  a: { kind: ActivityKind; creatorId?: bigint | string; actor: string; amount?: bigint; refId: string; text: string; anonymous?: boolean; via?: number },
) {
  context.Activity.set({
    id: eventId(e),
    creator_id: a.creatorId === undefined ? undefined : a.creatorId.toString(),
    actor: a.actor,
    kind: a.kind,
    amount: a.amount ?? 0n,
    refId: a.refId,
    text: a.text,
    anonymous: a.anonymous ?? false,
    via: a.via,
    timestamp: BigInt(e.block.timestamp),
    txHash: e.transaction.hash,
  });
}
