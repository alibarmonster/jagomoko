import { indexer } from "envio";
import { cleanText, handleKey, LIMITS } from "../lib/sanitize.js";
import { bumpProtocol, FIELDS, pairId, recordActivity, smallInt } from "../lib/domain.js";

indexer.onEvent({ contract: "CreatorRegistry", event: "CreatorRegistered", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const handle = cleanText(p.handle, LIMITS.handle);
  const id = p.creatorId.toString();

  context.Creator.set({
    id,
    owner: p.owner,
    handle: handle.value,
    handleKey: handleKey(handle.value),
    handleSanitized: handle.changed,
    creatorBps: smallInt(p.creatorBps),
    treasuryBps: smallInt(p.treasuryBps),
    communityBps: smallInt(p.communityBps),
    pendingCreatorBps: undefined,
    pendingTreasuryBps: undefined,
    pendingCommunityBps: undefined,
    pendingEffectiveAt: undefined,
    creatorBalance: 0n,
    treasuryBalance: 0n,
    treasuryShares: 0n,
    treasuryInvestedCost: 0n,
    treasuryYieldRealized: 0n,
    treasuryTargetBps: 0,
    communityBalance: 0n,
    totalReceived: 0n,
    tipCount: 0,
    createdAt: BigInt(event.block.timestamp),
  });
  await bumpProtocol(context, { creators: 1 });
  recordActivity(context, event, {
    kind: "CreatorJoined",
    creatorId: id,
    actor: p.owner,
    refId: id,
    text: `${handle.value} opened their realm`,
  });
});

indexer.onEvent({ contract: "CreatorRegistry", event: "ModeratorSet" }, async ({ event, context }) => {
  const p = event.params;
  await context.Creator.getOrThrow(p.creatorId.toString());
  context.Moderator.set({
    id: pairId(p.creatorId, p.moderator),
    creator_id: p.creatorId.toString(),
    account: p.moderator,
    enabled: p.enabled,
  });
});

indexer.onEvent({ contract: "CreatorRegistry", event: "SplitChangeQueued" }, async ({ event, context }) => {
  const p = event.params;
  const c = await context.Creator.getOrThrow(p.creatorId.toString());
  context.Creator.set({
    ...c,
    pendingCreatorBps: smallInt(p.creatorBps),
    pendingTreasuryBps: smallInt(p.treasuryBps),
    pendingCommunityBps: smallInt(p.communityBps),
    pendingEffectiveAt: p.effectiveAt,
  });
});

indexer.onEvent({ contract: "CreatorRegistry", event: "SplitChanged" }, async ({ event, context }) => {
  const p = event.params;
  const c = await context.Creator.getOrThrow(p.creatorId.toString());
  context.Creator.set({
    ...c,
    creatorBps: smallInt(p.creatorBps),
    treasuryBps: smallInt(p.treasuryBps),
    communityBps: smallInt(p.communityBps),
    pendingCreatorBps: undefined,
    pendingTreasuryBps: undefined,
    pendingCommunityBps: undefined,
    pendingEffectiveAt: undefined,
  });
});
