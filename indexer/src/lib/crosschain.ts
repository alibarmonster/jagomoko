import type { Ctx } from "./domain.js";

/**
 * Cross-chain tips. A viewer pays on another chain (Sepolia first); LayerZero delivers the message
 * to TipReceiver on Monad, which emits CrossChainTip and then deposits into the SplitVault for the
 * donor, in the same transaction. CrossChainTip parks where the tip came from, and the Deposited
 * handler takes it, so the tip, the feed row and the stream alert can say "via Sepolia".
 */

type TxMeta = { block: { number: number }; transaction: { hash: string } };

const pendingId = (e: TxMeta, donor: string) => `${e.block.number}-${e.transaction.hash}-${donor}`;

/** CrossChainTip: parks the source until the Deposited event of the same transaction takes it. */
export function holdSource(context: Ctx, e: TxMeta, donor: string, srcEid: number, guid: string) {
  context.PendingSource.set({ id: pendingId(e, donor), srcEid, guid });
}

/** Takes (and clears) the source of a deposit made for `donor` in this transaction, if any. */
export async function takeSource(context: Ctx, e: TxMeta, donor: string) {
  const id = pendingId(e, donor);
  const pending = await context.PendingSource.get(id);
  if (!pending) return undefined;
  context.PendingSource.deleteUnsafe(id);
  return { srcEid: pending.srcEid, guid: pending.guid };
}

/** Why a cross-chain tip was not credited (TipReceiver.BOUNCE_*). */
export const BOUNCE_TEXT: Record<number, string> = {
  1: "A tip from another chain was held back: it was over the limit",
  2: "A tip from another chain could not reach this guild, so it went back to the sender",
};
