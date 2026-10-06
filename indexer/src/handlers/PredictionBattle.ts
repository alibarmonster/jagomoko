import { indexer } from "envio";
import { cleanText, LIMITS, safeUrl } from "../lib/sanitize.js";
import { bumpProtocol, FIELDS, pairId, recordActivity, smallInt, statusFor, toVerdict } from "../lib/domain.js";
import { creditGuild } from "../lib/guild.js";

indexer.onEvent({ contract: "PredictionBattle", event: "BattleCreated", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const creatorId = p.creatorId.toString();
  await context.Creator.getOrThrow(creatorId);
  const question = cleanText(p.question, LIMITS.title).value;

  context.Battle.set({
    id: p.battleId.toString(),
    creator_id: creatorId,
    question,
    sideA: cleanText(p.sideA, LIMITS.side).value,
    sideB: cleanText(p.sideB, LIMITS.side).value,
    closeTime: p.closeTime,
    pointsMode: p.pointsMode,
    poolA: 0n,
    poolB: 0n,
    playersA: 0,
    playersB: 0,
    status: "Open",
    proposedVerdict: "None",
    proposer: undefined,
    proofUrl: undefined,
    challengeDeadline: undefined,
    disputer: undefined,
    juryCase_id: undefined,
    refundAll: false,
    toTreasury: 0n,
    winnings: 0n,
    createdAt: BigInt(event.block.timestamp),
    resolvedAt: undefined,
  });
  await bumpProtocol(context, { battles: 1 });
  recordActivity(context, event, { kind: "BattleCreated", creatorId, actor: event.srcAddress, refId: p.battleId.toString(), text: question });
});

indexer.onEvent({ contract: "PredictionBattle", event: "BattleJoined", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const battleId = p.battleId.toString();
  const side = smallInt(p.side, 1);
  const battle = await context.Battle.getOrThrow(battleId);
  const positionId = pairId(battleId, p.player);
  const existing = await context.Position.get(positionId);
  if (existing && existing.side !== side) throw new Error(`Battle ${battleId}: ${p.player} switched sides`);
  const player = await context.Player.get(p.player);
  const isNew = existing === undefined;

  // pools are authoritative from the event
  context.Battle.set({
    ...battle,
    poolA: p.poolA,
    poolB: p.poolB,
    playersA: battle.playersA + (isNew && side === 0 ? 1 : 0),
    playersB: battle.playersB + (isNew && side === 1 ? 1 : 0),
  });
  context.Position.set({
    id: positionId,
    battle_id: battleId,
    player_id: player?.id,
    playerAddress: p.player,
    side,
    stake: (existing?.stake ?? 0n) + p.amount,
    claimed: false,
    payout: 0n,
    xpEarned: 0n,
  });
  const sideName = side === 0 ? battle.sideA : battle.sideB;
  recordActivity(context, event, {
    kind: "BattleJoined",
    creatorId: battle.creator_id,
    actor: p.player,
    amount: p.amount,
    refId: battleId,
    text: `picked ${sideName}`,
  });
  await creditGuild(context, event, battle.creator_id, p.player, { picked: p.amount });
});

indexer.onEvent({ contract: "PredictionBattle", event: "OutcomeProposed", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const battle = await context.Battle.getOrThrow(p.marketId.toString());
  const verdict = toVerdict(p.verdict);
  context.Battle.set({
    ...battle,
    status: "Proposed",
    proposedVerdict: verdict,
    proposer: p.proposer,
    proofUrl: safeUrl(p.proofURI),
    challengeDeadline: p.challengeDeadline,
  });
  recordActivity(context, event, {
    kind: "BattleProposed",
    creatorId: battle.creator_id,
    actor: p.proposer,
    refId: battle.id,
    text: `Result reported: ${verdict === "Yes" ? battle.sideA : battle.sideB} — open for challenges`,
  });
});

indexer.onEvent({ contract: "PredictionBattle", event: "OutcomeDisputed", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const battle = await context.Battle.getOrThrow(p.marketId.toString());
  context.Battle.set({ ...battle, status: "Disputed", disputer: p.disputer, juryCase_id: p.caseId.toString() });
  recordActivity(context, event, { kind: "BattleDisputed", creatorId: battle.creator_id, actor: p.disputer, refId: battle.id, text: "Battle result disputed" });
});

indexer.onEvent({ contract: "PredictionBattle", event: "MarketResolved", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const battle = await context.Battle.getOrThrow(p.marketId.toString());
  context.Battle.set({ ...battle, status: statusFor(toVerdict(p.verdict)), resolvedAt: BigInt(event.block.timestamp) });
});

indexer.onEvent({ contract: "PredictionBattle", event: "BattleSettled", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const battle = await context.Battle.getOrThrow(p.battleId.toString());
  context.Battle.set({ ...battle, refundAll: p.refundAll, toTreasury: p.toTreasury, winnings: p.winnings });
  const verdict = toVerdict(p.verdict);
  recordActivity(context, event, {
    kind: "BattleResolved",
    creatorId: battle.creator_id,
    actor: event.srcAddress,
    amount: battle.poolA + battle.poolB,
    refId: battle.id,
    text: p.refundAll ? "Battle voided — stakes refunded" : `${verdict === "Yes" ? battle.sideA : battle.sideB} wins!`,
  });
});

indexer.onEvent({ contract: "PredictionBattle", event: "BattleClaimed", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const position = await context.Position.getOrThrow(pairId(p.battleId, p.player));
  context.Position.set({ ...position, claimed: true, payout: p.payout, xpEarned: p.xp });

  const battle = await context.Battle.getOrThrow(p.battleId.toString());
  const player = await context.Player.get(p.player);
  if (player && !battle.refundAll) {
    const profit = p.payout > position.stake ? p.payout - position.stake : 0n;
    context.Player.set({ ...player, battlesWon: player.battlesWon + 1, totalWon: player.totalWon + profit });
  }
  await creditGuild(context, event, battle.creator_id, p.player, { action: false });
});
