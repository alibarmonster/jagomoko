import type { Ctx } from "./domain.js";

/**
 * Guilds: a creator's supporters, ranked by the XP they earned there.
 *
 * XP is global on chain (one number per character), so the index works out where each bit was
 * earned. Every contract grants XP right before it emits its own event, in the same transaction
 * (pinned by contracts/test/EventOrder.t.sol). So XPChanged parks its delta in PendingXP under
 * (block, transaction, player), and the action's handler, which knows the creator, takes it from
 * there with creditGuild(). That stays exact when one transaction holds several actions, even for
 * different guilds: each action takes only what was granted since the previous one.
 */

/** The block and transaction an event came from (handlers that call these select `transaction.hash`). */
type TxMeta = { block: { number: number; timestamp: number }; transaction: { hash: string } };

const pendingId = (e: TxMeta, player: string) => `${e.block.number}-${e.transaction.hash}-${player}`;

/** XPChanged: parks a positive delta until the action event of the same transaction picks it up. */
export async function holdXP(context: Ctx, e: TxMeta, player: string, delta: bigint) {
  if (delta <= 0n) return; // slashes only touch global XP, so guild XP never drops
  const id = pendingId(e, player);
  const pending = await context.PendingXP.get(id);
  context.PendingXP.set({ id, amount: (pending?.amount ?? 0n) + delta });
}

/** Takes (and clears) the XP `player` was granted earlier in this transaction. */
export async function takeXP(context: Ctx, e: TxMeta, player: string): Promise<bigint> {
  const id = pendingId(e, player);
  const pending = await context.PendingXP.get(id);
  if (!pending) return 0n;
  context.PendingXP.deleteUnsafe(id);
  return pending.amount;
}

export type GuildCredit = {
  tipped?: bigint;
  backed?: bigint;
  picked?: bigint;
  /** false for results (a claim, a win, votes on your clip): XP, but not a new action of yours */
  action?: boolean;
};

/**
 * Credits what `player` just did to the guild of `creatorId`: the XP granted for it in this
 * transaction, plus the totals in `credit`. Makes them a member on their first action. A wallet
 * without a character and the guild's own creator are never members (the XP is still taken, so it
 * cannot leak into a later action of the same transaction).
 */
export async function creditGuild(context: Ctx, e: TxMeta, creatorId: string, player: string, credit: GuildCredit = {}) {
  const xp = await takeXP(context, e, player);
  if (!(await context.Player.get(player))) return;
  const creator = await context.Creator.getOrThrow(creatorId);
  if (creator.owner.toLowerCase() === player.toLowerCase()) return;

  const id = `${creatorId}-${player}`;
  const member = await context.Member.get(id);
  const now = BigInt(e.block.timestamp);
  const guildXp = (member?.guildXp ?? 0n) + xp;
  context.Member.set({
    id,
    creator_id: creatorId,
    player_id: player,
    guildXp,
    totalTipped: (member?.totalTipped ?? 0n) + (credit.tipped ?? 0n),
    totalBacked: (member?.totalBacked ?? 0n) + (credit.backed ?? 0n),
    totalPicked: (member?.totalPicked ?? 0n) + (credit.picked ?? 0n),
    actions: (member?.actions ?? 0) + (credit.action === false ? 0 : 1),
    joinedAt: member?.joinedAt ?? now,
    lastActiveAt: now,
  });

  // guild XP only grows, so the top member can be kept as we go: a member takes the crown only by
  // passing the current Jago, and on a tie the one who got there first keeps it
  const takesCrown = guildXp > creator.jagoXp;
  context.Creator.set({
    ...creator,
    memberCount: creator.memberCount + (member ? 0 : 1),
    jago_id: takesCrown ? id : creator.jago_id,
    jagoXp: takesCrown ? guildXp : creator.jagoXp,
  });
}
