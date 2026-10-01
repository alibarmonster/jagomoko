import { indexer } from "envio";
import { FIELDS, pairId, recordActivity, smallInt, toVerdict } from "../lib/domain.js";

/** Which market contract opened the case — only the configured clients are accepted. */
function marketTypeOf(chainId: number, client: string): "Quest" | "Battle" {
  const chain = (indexer.chains as unknown as Record<number, { QuestEscrow: { addresses: readonly string[] }; PredictionBattle: { addresses: readonly string[] } }>)[chainId];
  if (!chain) throw new Error(`Unknown chain ${chainId}`);
  const is = (list: readonly string[]) => list.some((a) => a.toLowerCase() === client.toLowerCase());
  if (is(chain.QuestEscrow.addresses)) return "Quest";
  if (is(chain.PredictionBattle.addresses)) return "Battle";
  throw new Error(`Jury case opened by unknown client ${client}`);
}

indexer.onEvent({ contract: "Jury", event: "CaseOpened", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const marketType = marketTypeOf(event.chainId, p.client);
  const creatorId = p.creatorId.toString();
  await context.Creator.getOrThrow(creatorId);

  context.JuryCase.set({
    id: p.caseId.toString(),
    marketType,
    marketId: p.marketId.toString(),
    creator_id: creatorId,
    jurors: [...p.jurors],
    deadline: p.deadline,
    yesVotes: 0,
    noVotes: 0,
    resolved: false,
    verdict: "None",
    openedAt: BigInt(event.block.timestamp),
  });
  recordActivity(context, event, {
    kind: "JuryCaseOpened",
    creatorId,
    actor: p.client,
    refId: p.caseId.toString(),
    text: `${marketType} #${p.marketId} goes to a jury of ${p.jurors.length}`,
  });
});

indexer.onEvent({ contract: "Jury", event: "JuryVoted", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const verdict = toVerdict(p.verdict);
  const c = await context.JuryCase.getOrThrow(p.caseId.toString());
  context.JuryCase.set({
    ...c,
    yesVotes: c.yesVotes + (verdict === "Yes" ? 1 : 0),
    noVotes: c.noVotes + (verdict === "No" ? 1 : 0),
  });
  context.JuryVote.set({
    id: pairId(p.caseId, p.juror),
    juryCase_id: c.id,
    juror: p.juror,
    verdict,
    fee: 0n,
    timestamp: BigInt(event.block.timestamp),
  });
  const juror = await context.Player.getOrThrow(p.juror);
  context.Player.set({ ...juror, juryVotes: juror.juryVotes + 1 });
});

indexer.onEvent({ contract: "Jury", event: "JurorRewarded" }, async ({ event, context }) => {
  const p = event.params;
  const vote = await context.JuryVote.getOrThrow(pairId(p.caseId, p.juror));
  context.JuryVote.set({ ...vote, fee: p.fee });
});

indexer.onEvent({ contract: "Jury", event: "CaseResolved", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const c = await context.JuryCase.getOrThrow(p.caseId.toString());
  const verdict = toVerdict(p.verdict);
  context.JuryCase.set({
    ...c,
    resolved: true,
    verdict,
    yesVotes: smallInt(p.yesVotes),
    noVotes: smallInt(p.noVotes),
  });
  recordActivity(context, event, {
    kind: "JuryCaseResolved",
    creatorId: c.creator_id,
    actor: event.srcAddress,
    refId: c.id,
    text: `Jury ruled ${verdict} (${p.yesVotes}–${p.noVotes})`,
  });
});

indexer.onEvent({ contract: "Jury", event: "JurorEnlisted" }, async ({ event, context }) => {
  const player = await context.Player.getOrThrow(event.params.juror);
  context.Player.set({ ...player, enlisted: true });
});

indexer.onEvent({ contract: "Jury", event: "JurorLeft" }, async ({ event, context }) => {
  const player = await context.Player.getOrThrow(event.params.juror);
  context.Player.set({ ...player, enlisted: false });
});

indexer.onEvent({ contract: "Jury", event: "ParamsSet" }, async ({ event, context }) => {
  const p = event.params;
  context.JuryParams.set({
    id: "current",
    minLevel: p.minLevel,
    jurorsPerCase: p.jurorsPerCase,
    voteWindow: p.voteWindow,
    jurorFee: p.jurorFee,
  });
});
