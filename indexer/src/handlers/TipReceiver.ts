import { indexer } from "envio";
import { BOUNCE_TEXT, holdSource, takeSource } from "../lib/crosschain.js";
import { FIELDS, recordActivity, smallInt } from "../lib/domain.js";

// The Monad end of cross-chain tips (see lib/crosschain.ts). The tip itself is the SplitVault
// Deposited event that follows in the same transaction; this only records where it came from.
indexer.onEvent({ contract: "TipReceiver", event: "CrossChainTip", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  holdSource(context, event, p.donor, smallInt(p.srcEid, 0x7fffffff), p.guid);
});

indexer.onEvent({ contract: "TipReceiver", event: "TipBounced", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  // a deposit that failed after CrossChainTip left its source parked: clear it
  await takeSource(context, event, p.donor);
  const creator = await context.Creator.get(p.creatorId.toString());
  recordActivity(context, event, {
    kind: "TipBounced",
    creatorId: creator ? creator.id : undefined,
    actor: p.donor,
    amount: p.amount,
    refId: p.guid,
    text: BOUNCE_TEXT[smallInt(p.reason)] ?? "A tip from another chain was not credited",
    via: smallInt(p.srcEid, 0x7fffffff),
  });
});
