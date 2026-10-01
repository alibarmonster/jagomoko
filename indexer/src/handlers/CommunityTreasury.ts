import { indexer } from "envio";
import { cleanText, LIMITS } from "../lib/sanitize.js";
import { FIELDS, pairId, recordActivity, toProposalStatus } from "../lib/domain.js";

indexer.onEvent({ contract: "CommunityTreasury", event: "ProposalCreated", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const creatorId = p.creatorId.toString();
  await context.Creator.getOrThrow(creatorId);
  const description = cleanText(p.description, LIMITS.description, { multiline: true }).value;

  context.Proposal.set({
    id: p.proposalId.toString(),
    creator_id: creatorId,
    proposer: p.proposer,
    recipient: p.recipient,
    amount: p.amount,
    description,
    endsAt: p.endsAt,
    forWeight: 0n,
    againstWeight: 0n,
    voters: 0,
    status: "Active",
    createdAt: BigInt(event.block.timestamp),
  });
  recordActivity(context, event, {
    kind: "ProposalCreated",
    creatorId,
    actor: p.proposer,
    amount: p.amount,
    refId: p.proposalId.toString(),
    text: cleanText(description, LIMITS.memo).value,
  });
});

indexer.onEvent({ contract: "CommunityTreasury", event: "ProposalVoted", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const proposal = await context.Proposal.getOrThrow(p.proposalId.toString());
  context.Proposal.set({
    ...proposal,
    forWeight: proposal.forWeight + (p.support ? p.weight : 0n),
    againstWeight: proposal.againstWeight + (p.support ? 0n : p.weight),
    voters: proposal.voters + 1,
  });
  context.ProposalVote.set({
    id: pairId(p.proposalId, p.voter),
    proposal_id: proposal.id,
    voter: p.voter,
    support: p.support,
    weight: p.weight,
    timestamp: BigInt(event.block.timestamp),
  });
  recordActivity(context, event, {
    kind: "ProposalVoted",
    creatorId: proposal.creator_id,
    actor: p.voter,
    amount: p.weight,
    refId: proposal.id,
    text: p.support ? "Voted for" : "Voted against",
  });
});

indexer.onEvent({ contract: "CommunityTreasury", event: "ProposalFinalized", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const proposal = await context.Proposal.getOrThrow(p.proposalId.toString());
  const status = toProposalStatus(p.status);
  context.Proposal.set({ ...proposal, status });
  recordActivity(context, event, {
    kind: "ProposalFinalized",
    creatorId: proposal.creator_id,
    actor: event.srcAddress,
    amount: proposal.amount,
    refId: proposal.id,
    text: `Proposal ${status.toLowerCase()}`,
  });
});
