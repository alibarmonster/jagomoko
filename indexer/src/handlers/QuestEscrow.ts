import { indexer } from "envio";
import { cleanText, LIMITS, safeUrl } from "../lib/sanitize.js";
import { bumpProtocol, FIELDS, pairId, recordActivity, statusFor, toVerdict } from "../lib/domain.js";
import { creditGuild } from "../lib/guild.js";

indexer.onEvent({ contract: "QuestEscrow", event: "QuestCreated", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const creatorId = p.creatorId.toString();
  await context.Creator.getOrThrow(creatorId);
  const title = cleanText(p.title, LIMITS.title).value;

  context.Quest.set({
    id: p.questId.toString(),
    creator_id: creatorId,
    title,
    goalDeadline: p.goalDeadline,
    pool: 0n,
    backers: 0,
    status: "Open",
    proposedVerdict: "None",
    proposer: undefined,
    proofUrl: undefined,
    challengeDeadline: undefined,
    disputer: undefined,
    juryCase_id: undefined,
    toCreatorVault: 0n,
    toTreasury: 0n,
    refundable: 0n,
    createdAt: BigInt(event.block.timestamp),
    resolvedAt: undefined,
  });
  await bumpProtocol(context, { quests: 1 });
  recordActivity(context, event, { kind: "QuestCreated", creatorId, actor: event.srcAddress, refId: p.questId.toString(), text: title });
});

indexer.onEvent({ contract: "QuestEscrow", event: "QuestBacked", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const questId = p.questId.toString();
  const quest = await context.Quest.getOrThrow(questId);
  const backingId = pairId(questId, p.backer);
  const existing = await context.Backing.get(backingId);
  const player = await context.Player.get(p.backer);

  if (quest.pool + p.amount !== p.newPool) throw new Error(`Quest ${questId}: pool mismatch`);
  context.Quest.set({ ...quest, pool: p.newPool, backers: quest.backers + (existing ? 0 : 1) });
  context.Backing.set({
    id: backingId,
    quest_id: questId,
    backer_id: player?.id,
    backerAddress: p.backer,
    amount: (existing?.amount ?? 0n) + p.amount,
    claimed: false,
    refund: 0n,
  });
  if (player) context.Player.set({ ...player, totalBacked: player.totalBacked + p.amount });
  recordActivity(context, event, {
    kind: "QuestBacked",
    creatorId: quest.creator_id,
    actor: p.backer,
    amount: p.amount,
    refId: questId,
    text: `backed "${quest.title}"`,
  });
  await creditGuild(context, event, quest.creator_id, p.backer, { backed: p.amount });
});

indexer.onEvent({ contract: "QuestEscrow", event: "OutcomeProposed", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const quest = await context.Quest.getOrThrow(p.marketId.toString());
  const verdict = toVerdict(p.verdict);
  context.Quest.set({
    ...quest,
    status: "Proposed",
    proposedVerdict: verdict,
    proposer: p.proposer,
    proofUrl: safeUrl(p.proofURI),
    challengeDeadline: p.challengeDeadline,
  });
  recordActivity(context, event, {
    kind: "QuestProposed",
    creatorId: quest.creator_id,
    actor: p.proposer,
    refId: quest.id,
    text: `"${quest.title}" reported as ${verdict === "Yes" ? "completed" : "failed"} — open for challenges`,
  });
});

indexer.onEvent({ contract: "QuestEscrow", event: "OutcomeDisputed", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const quest = await context.Quest.getOrThrow(p.marketId.toString());
  context.Quest.set({ ...quest, status: "Disputed", disputer: p.disputer, juryCase_id: p.caseId.toString() });
  recordActivity(context, event, { kind: "QuestDisputed", creatorId: quest.creator_id, actor: p.disputer, refId: quest.id, text: `"${quest.title}" was disputed` });
});

indexer.onEvent({ contract: "QuestEscrow", event: "MarketResolved", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const quest = await context.Quest.getOrThrow(p.marketId.toString());
  context.Quest.set({ ...quest, status: statusFor(toVerdict(p.verdict)), resolvedAt: BigInt(event.block.timestamp) });
});

indexer.onEvent({ contract: "QuestEscrow", event: "QuestSettled", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const quest = await context.Quest.getOrThrow(p.questId.toString());
  if (p.toCreatorVault + p.toTreasury + p.refundable !== quest.pool) {
    throw new Error(`Quest ${quest.id}: settlement does not match pool`);
  }
  context.Quest.set({ ...quest, toCreatorVault: p.toCreatorVault, toTreasury: p.toTreasury, refundable: p.refundable });
  const verdict = toVerdict(p.verdict);
  recordActivity(context, event, {
    kind: "QuestResolved",
    creatorId: quest.creator_id,
    actor: event.srcAddress,
    amount: quest.pool,
    refId: quest.id,
    text:
      verdict === "Yes"
        ? `Quest complete: "${quest.title}"`
        : verdict === "No"
          ? `Quest failed: "${quest.title}" — 90% refunded, 10% to the treasury`
          : `Quest voided: "${quest.title}" — full refunds`,
  });
});

indexer.onEvent({ contract: "QuestEscrow", event: "QuestClaimed", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const backing = await context.Backing.getOrThrow(pairId(p.questId, p.backer));
  context.Backing.set({ ...backing, claimed: true, refund: p.refund });
  // the bonus for a completed quest counts for the guild that ran it
  const quest = await context.Quest.getOrThrow(p.questId.toString());
  await creditGuild(context, event, quest.creator_id, p.backer, { action: false });
});
