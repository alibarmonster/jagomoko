import { indexer } from "envio";
import { cleanText, clipUrl, LIMITS } from "../lib/sanitize.js";
import { FIELDS, pairId, recordActivity } from "../lib/domain.js";
import { creditGuild } from "../lib/guild.js";

// Clip bounties. A clip's link is stored only once clipUrl() accepts it, and it never goes into the
// feed or onto a stream: the guild's Clips page is the only place a link is shown.

indexer.onEvent({ contract: "ClipBoard", event: "BountyCreated", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const creatorId = p.creatorId.toString();
  await context.Creator.getOrThrow(creatorId);
  const title = cleanText(p.title, LIMITS.title).value;

  context.Bounty.set({
    id: p.bountyId.toString(),
    creator_id: creatorId,
    by: p.by,
    title,
    escrow: p.reward,
    communityFunds: 0n,
    submitEnd: p.submitEnd,
    voteEnd: p.voteEnd,
    clipCount: 0,
    voteCount: 0,
    status: "Open",
    winner_id: undefined,
    paidOut: 0n,
    createdAt: BigInt(event.block.timestamp),
  });
  recordActivity(context, event, { kind: "BountyCreated", creatorId, actor: p.by, amount: p.reward, refId: p.bountyId.toString(), text: title });
});

indexer.onEvent({ contract: "ClipBoard", event: "BountyFunded", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const bounty = await context.Bounty.getOrThrow(p.bountyId.toString());
  const proposal = await context.Proposal.getOrThrow(p.proposalId.toString());
  if (proposal.creator_id !== bounty.creator_id) throw new Error(`Bounty ${bounty.id}: payout ${proposal.id} belongs to another creator`);

  context.Bounty.set({ ...bounty, communityFunds: bounty.communityFunds + p.amount });
  context.BountyFunding.set({ id: proposal.id, bounty_id: bounty.id, proposal_id: proposal.id, amount: p.amount, timestamp: BigInt(event.block.timestamp) });
  context.Proposal.set({ ...proposal, attachedTo_id: bounty.id });
  recordActivity(context, event, {
    kind: "BountyFunded",
    creatorId: bounty.creator_id,
    actor: event.srcAddress,
    amount: p.amount,
    refId: bounty.id,
    text: `The community chipped in for "${bounty.title}"`,
  });
});

// the money itself shows up as the vault's TreasuryFunded
indexer.onEvent({ contract: "ClipBoard", event: "ProposalFundsReturned" }, async ({ event, context }) => {
  const proposal = await context.Proposal.getOrThrow(event.params.proposalId.toString());
  context.Proposal.set({ ...proposal, returned: true });
});

indexer.onEvent({ contract: "ClipBoard", event: "ClipSubmitted", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const bounty = await context.Bounty.getOrThrow(p.bountyId.toString());
  const link = clipUrl(p.url);
  const author = await context.Player.get(p.author);

  context.Clip.set({
    id: p.clipId.toString(),
    bounty_id: bounty.id,
    author: p.author,
    authorPlayer_id: author?.id,
    url: link?.url,
    platform: link?.platform,
    weight: 0n,
    votes: 0,
    hidden: false,
    won: false,
    createdAt: BigInt(event.block.timestamp),
  });
  context.Bounty.set({ ...bounty, clipCount: bounty.clipCount + 1 });
  recordActivity(context, event, { kind: "ClipSubmitted", creatorId: bounty.creator_id, actor: p.author, refId: bounty.id, text: `sent a clip for "${bounty.title}"` });
  await creditGuild(context, event, bounty.creator_id, p.author);
});

indexer.onEvent({ contract: "ClipBoard", event: "ClipVoted", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const clip = await context.Clip.getOrThrow(p.clipId.toString());
  const bounty = await context.Bounty.getOrThrow(p.bountyId.toString());
  if (clip.bounty_id !== bounty.id) throw new Error(`Clip ${clip.id} is not in bounty ${bounty.id}`);

  context.Clip.set({ ...clip, weight: clip.weight + p.weight, votes: clip.votes + 1 });
  context.Bounty.set({ ...bounty, voteCount: bounty.voteCount + 1 });
  context.ClipVote.set({
    id: pairId(bounty.id, p.voter),
    clip_id: clip.id,
    bountyId: bounty.id,
    voter: p.voter,
    weight: p.weight,
    timestamp: BigInt(event.block.timestamp),
  });
  // a vote's weight is sqrt(XP), not money, so the feed row carries no amount
  recordActivity(context, event, { kind: "ClipVoted", creatorId: bounty.creator_id, actor: p.voter, refId: bounty.id, text: `voted in "${bounty.title}"` });
  // the voter's Governance XP, then the author's Clip XP (both granted before this event)
  await creditGuild(context, event, bounty.creator_id, p.voter);
  await creditGuild(context, event, bounty.creator_id, clip.author, { action: false });
});

indexer.onEvent({ contract: "ClipBoard", event: "ClipHidden" }, async ({ event, context }) => {
  const clip = await context.Clip.getOrThrow(event.params.clipId.toString());
  context.Clip.set({ ...clip, hidden: event.params.hidden });
});

indexer.onEvent({ contract: "ClipBoard", event: "BountyWon", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const bounty = await context.Bounty.getOrThrow(p.bountyId.toString());
  const clip = await context.Clip.getOrThrow(p.clipId.toString());

  context.Clip.set({ ...clip, won: true });
  context.Bounty.set({ ...bounty, status: "Won", winner_id: clip.id, paidOut: p.amount });
  recordActivity(context, event, { kind: "BountyWon", creatorId: bounty.creator_id, actor: p.author, amount: p.amount, refId: bounty.id, text: `won "${bounty.title}"` });
  await creditGuild(context, event, bounty.creator_id, p.author, { action: false });
});

indexer.onEvent({ contract: "ClipBoard", event: "BountyRefunded", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const bounty = await context.Bounty.getOrThrow(p.bountyId.toString());
  context.Bounty.set({ ...bounty, status: "Refunded" });
  recordActivity(context, event, {
    kind: "BountyRefunded",
    creatorId: bounty.creator_id,
    actor: event.srcAddress,
    amount: p.toFunder + p.toTreasury,
    refId: bounty.id,
    text: `No winner for "${bounty.title}" — the money went back`,
  });
});
