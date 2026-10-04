/**
 * The data seam. Every server page reads through these functions, so a screen never knows whether
 * it is showing the typed sample world (NEXT_PUBLIC_SAMPLE_DATA=true) or the live record from the
 * Envio indexer (false).
 */
import { SAMPLE_DATA } from "../config";
import { buildSampleWorld, SAMPLE_CREATORS } from "./sample";
import {
  fetchBoard,
  fetchJury,
  fetchMarkets,
  fetchProtocol,
  fetchRealm,
  fetchRealms,
  type BoardData,
  type JuryData,
  type MarketsData,
  type RealmSummary,
} from "./indexer";
import type { ProtocolStats, World } from "./types";

export type { World } from "./types";
export type { BoardData, JuryData, MarketsData, RealmSummary } from "./indexer";

/** One realm, by the handle in its address. Null when there is no such realm. */
export async function getWorld(handle: string): Promise<World | null> {
  if (SAMPLE_DATA) {
    const world = buildSampleWorld(Date.now());
    return world.creator.handleKey === handle.toLowerCase() ? world : null;
  }
  return fetchRealm(handle);
}

export async function getRealms(): Promise<RealmSummary[]> {
  if (SAMPLE_DATA) {
    const w = buildSampleWorld(Date.now());
    return [
      {
        creator: w.creator,
        openQuests: w.quests.filter((q) => q.status === "Open").length,
        liveBattles: w.battles.filter((b) => b.status === "Open").length,
      },
    ];
  }
  return fetchRealms();
}

export async function getBoard(): Promise<BoardData> {
  if (SAMPLE_DATA) {
    const w = buildSampleWorld(Date.now());
    return {
      players: w.players,
      creators: SAMPLE_CREATORS.map((c) => ({ handle: c.handle, received: c.received, quests: c.quests, supporters: c.supporters })),
    };
  }
  return fetchBoard();
}

export async function getJury(): Promise<JuryData> {
  if (SAMPLE_DATA) {
    const w = buildSampleWorld(Date.now());
    return { cases: w.juryCases, poolSize: w.players.filter((p) => p.enlisted).length };
  }
  return fetchJury();
}

/** Every quest and battle (and the realms they belong to): what the "me" page looks things up in. */
export async function getMarkets(): Promise<MarketsData> {
  if (SAMPLE_DATA) {
    const w = buildSampleWorld(Date.now());
    return { quests: w.quests, battles: w.battles, creators: [w.creator] };
  }
  return fetchMarkets();
}

/** Protocol-wide numbers for the front page. Null when the live record cannot be reached (shown as dashes). */
export async function getProtocol(): Promise<ProtocolStats | null> {
  if (SAMPLE_DATA) return buildSampleWorld(Date.now()).protocol;
  try {
    return await fetchProtocol();
  } catch {
    return null;
  }
}
