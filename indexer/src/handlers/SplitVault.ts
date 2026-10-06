import { indexer } from "envio";
import { cleanText, LIMITS } from "../lib/sanitize.js";
import { readTipMemo, ZERO_ADDRESS } from "../lib/tip-memo.js";
import { creditGuild, takeXP } from "../lib/guild.js";
import { takeSource } from "../lib/crosschain.js";
import { bumpProtocol, eventId, FIELDS, recordActivity, smallInt, type Ctx, type EventMeta } from "../lib/domain.js";

indexer.onEvent({ contract: "SplitVault", event: "Deposited", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  if (p.creatorCut + p.treasuryCut + p.communityCut !== p.amount) {
    throw new Error(`Deposit ${eventId(event)}: cuts do not sum to amount`);
  }
  const id = p.creatorId.toString();
  const c = await context.Creator.getOrThrow(id);
  const { anonymous, memo } = readTipMemo(p.memo);
  // a tip paid on another chain: TipReceiver announced it just before this deposit
  const source = await takeSource(context, event, p.from);

  context.Creator.set({
    ...c,
    creatorBalance: c.creatorBalance + p.creatorCut,
    treasuryBalance: c.treasuryBalance + p.treasuryCut,
    communityBalance: c.communityBalance + p.communityCut,
    totalReceived: c.totalReceived + p.amount,
    tipCount: c.tipCount + 1,
  });
  context.Deposit.set({
    id: eventId(event),
    creator_id: id,
    from: p.from,
    amount: p.amount,
    creatorCut: p.creatorCut,
    treasuryCut: p.treasuryCut,
    communityCut: p.communityCut,
    memo,
    anonymous,
    via: source?.srcEid,
    lzGuid: source?.guid,
    timestamp: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
  });

  // Quest pools are deposited by the escrow contract (no Player) — only real
  // viewers get their lifetime tipping total bumped.
  const tipper = await context.Player.get(p.from);
  if (tipper) context.Player.set({ ...tipper, totalTipped: tipper.totalTipped + p.amount });
  // an anonymous tip never makes a member or moves a guild's numbers, or the guild page would give
  // the tipper away; its XP is dropped here so it cannot land on a later action either
  if (anonymous) await takeXP(context, event, p.from);
  else await creditGuild(context, event, id, p.from, { tipped: p.amount });

  await bumpProtocol(context, { totalVolume: p.amount, totalTreasury: p.treasuryCut });
  recordActivity(context, event, {
    kind: "Tip",
    creatorId: id,
    // the feed and the overlay read `actor`: for an anonymous tip it must not be the tipper
    actor: anonymous ? ZERO_ADDRESS : p.from,
    amount: p.amount,
    refId: eventId(event),
    text: memo,
    anonymous,
    via: source?.srcEid,
  });
});

indexer.onEvent({ contract: "SplitVault", event: "TreasuryFunded", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const id = p.creatorId.toString();
  const c = await context.Creator.getOrThrow(id);
  const reason = cleanText(p.reason, LIMITS.reason).value;
  context.Creator.set({ ...c, treasuryBalance: c.treasuryBalance + p.amount });
  flow(context, event, id, "TreasuryFunded", p.from, p.amount, reason);
  await bumpProtocol(context, { totalTreasury: p.amount });
  recordActivity(context, event, { kind: "TreasuryFunded", creatorId: id, actor: p.from, amount: p.amount, refId: eventId(event), text: reason });
});

indexer.onEvent({ contract: "SplitVault", event: "CreatorWithdrawn", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const id = p.creatorId.toString();
  const c = await context.Creator.getOrThrow(id);
  context.Creator.set({ ...c, creatorBalance: debit(c.creatorBalance, p.amount, "creatorBalance") });
  flow(context, event, id, "CreatorWithdrawn", p.to, p.amount, "");
});

indexer.onEvent({ contract: "SplitVault", event: "TreasurySpent", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const id = p.creatorId.toString();
  const c = await context.Creator.getOrThrow(id);
  context.Creator.set({ ...c, treasuryBalance: debit(c.treasuryBalance, p.amount, "treasuryBalance") });
  flow(context, event, id, "TreasurySpent", p.to, p.amount, "");
  recordActivity(context, event, { kind: "TreasurySpent", creatorId: id, actor: p.to, amount: p.amount, refId: eventId(event), text: "Community treasury payout" });
});

indexer.onEvent({ contract: "SplitVault", event: "CommunitySpent", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const id = p.creatorId.toString();
  const c = await context.Creator.getOrThrow(id);
  context.Creator.set({ ...c, communityBalance: debit(c.communityBalance, p.amount, "communityBalance") });
  flow(context, event, id, "CommunitySpent", p.to, p.amount, "Juror fee");
});

indexer.onEvent({ contract: "SplitVault", event: "TreasuryTargetSet", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const c = await context.Creator.getOrThrow(p.creatorId.toString());
  context.Creator.set({ ...c, treasuryTargetBps: smallInt(p.bps) });
});

// Treasury yield. The invested part earns on its own (no event), so the index keeps the shares and
// their cost; the live value comes from SplitVault.investedValue. Within one transaction a spend
// emits TreasuryDivested BEFORE TreasurySpent, so the liquid balance never dips below zero here.
indexer.onEvent({ contract: "SplitVault", event: "TreasuryInvested", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const id = p.creatorId.toString();
  const c = await context.Creator.getOrThrow(id);
  context.Creator.set({
    ...c,
    treasuryBalance: debit(c.treasuryBalance, p.assets, "treasuryBalance"),
    treasuryShares: c.treasuryShares + p.shares,
    treasuryInvestedCost: c.treasuryInvestedCost + p.assets,
  });
  flow(context, event, id, "TreasuryInvested", event.srcAddress, p.assets, "Put to work");
  recordActivity(context, event, { kind: "TreasuryInvested", creatorId: id, actor: event.srcAddress, amount: p.assets, refId: eventId(event), text: "Treasury put to work" });
});

indexer.onEvent({ contract: "SplitVault", event: "TreasuryDivested", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const id = p.creatorId.toString();
  const c = await context.Creator.getOrThrow(id);
  if (p.shares > c.treasuryShares) throw new Error(`treasuryShares would go negative (${c.treasuryShares} - ${p.shares})`);
  // what the redeemed shares originally cost, so the rest keeps its cost basis
  const costOut = c.treasuryShares === 0n ? 0n : (c.treasuryInvestedCost * p.shares) / c.treasuryShares;
  context.Creator.set({
    ...c,
    treasuryBalance: c.treasuryBalance + p.assets,
    treasuryShares: c.treasuryShares - p.shares,
    treasuryInvestedCost: c.treasuryInvestedCost - costOut,
    treasuryYieldRealized: c.treasuryYieldRealized + (p.assets - costOut),
  });
  flow(context, event, id, "TreasuryDivested", event.srcAddress, p.assets, "Pulled back out");
  recordActivity(context, event, { kind: "TreasuryDivested", creatorId: id, actor: event.srcAddress, amount: p.assets, refId: eventId(event), text: "Treasury pulled back out" });
});

/** The contract can never overdraw a bucket; if the index would, it is out of sync. */
function debit(balance: bigint, amount: bigint, what: string): bigint {
  if (amount > balance) throw new Error(`${what} would go negative (${balance} - ${amount})`);
  return balance - amount;
}

function flow(
  context: Ctx,
  event: EventMeta,
  creatorId: string,
  kind: "CreatorWithdrawn" | "TreasuryFunded" | "TreasurySpent" | "CommunitySpent" | "TreasuryInvested" | "TreasuryDivested",
  account: string,
  amount: bigint,
  reason: string,
) {
  context.VaultFlow.set({
    id: eventId(event),
    creator_id: creatorId,
    kind,
    account,
    amount,
    reason,
    timestamp: BigInt(event.block.timestamp),
    txHash: event.transaction.hash,
  });
}
