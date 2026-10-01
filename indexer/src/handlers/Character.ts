import { indexer } from "envio";
import { cleanText, LIMITS } from "../lib/sanitize.js";
import { bumpProtocol, eventId, FIELDS, levelForXP, recordActivity, toRole, toXPKind } from "../lib/domain.js";

indexer.onEvent({ contract: "Character", event: "CharacterMinted", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const name = cleanText(p.name, LIMITS.name);
  const role = toRole(p.role);

  context.Player.set({
    id: p.player,
    tokenId: p.tokenId,
    role,
    name: name.value,
    nameSanitized: name.changed,
    xp: 0n,
    level: 1,
    totalTipped: 0n,
    totalBacked: 0n,
    totalWon: 0n,
    battlesWon: 0,
    juryVotes: 0,
    enlisted: false,
    createdAt: BigInt(event.block.timestamp),
  });
  await bumpProtocol(context, { players: 1 });
  recordActivity(context, event, {
    kind: "CharacterMinted",
    actor: p.player,
    refId: p.tokenId.toString(),
    text: `${name.value} joined as a ${role}`,
  });
});

indexer.onEvent({ contract: "Character", event: "XPChanged", fields: FIELDS }, async ({ event, context }) => {
  const p = event.params;
  const player = await context.Player.getOrThrow(p.player);
  // newXp is the contract's authoritative total — mirror it rather than
  // summing deltas, so the index can never drift from chain state.
  context.Player.set({ ...player, xp: p.newXp, level: levelForXP(p.newXp) });
  context.XPEvent.set({
    id: eventId(event),
    player_id: p.player,
    delta: p.delta,
    newXp: p.newXp,
    kind: toXPKind(p.kind),
    timestamp: BigInt(event.block.timestamp),
  });
});
