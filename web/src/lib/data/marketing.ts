/**
 * A frozen sample world for the landing page. Marketing composites never tick
 * and never show relative times, so they are identical on the server and the
 * client and never go stale. Every composite is labelled "Sample stream".
 */
import { buildSampleWorld } from "./sample";

const FIXED_NOW = 1_760_000_000_000;

export const marketingWorld = buildSampleWorld(FIXED_NOW);

export const heroQuest = marketingWorld.quests.find((q) => q.id === "1")!;
export const challengeQuest = marketingWorld.quests.find((q) => q.id === "5")!;
export const heroBattle = marketingWorld.battles.find((b) => b.id === "1")!;
export const juryCase = marketingWorld.juryCases.find((c) => c.id === "7")!;
export const alice = marketingWorld.players.find((p) => p.name === "Alice")!;

export const marketingSplit = {
  creatorBps: marketingWorld.creator.creatorBps,
  treasuryBps: marketingWorld.creator.treasuryBps,
  communityBps: marketingWorld.creator.communityBps,
};

export const marketingBackers = marketingWorld.players.slice(0, 6).map((p) => ({ name: p.name, role: p.role, seed: p.id }));
