import type { Mine } from "./mine";
import type { IndexerStatus } from "./status";
import type { ClipsData, World } from "./types";
import { fromWire } from "./wire";

/**
 * Browser-side readers for the live data routes. They never throw: a failure is a null (or false),
 * and the screen shows its last good data and tries again on the next tick.
 */

export type RealmResult = { world: World } | { notFound: true } | { error: true };

export async function fetchRealmClient(handle: string): Promise<RealmResult> {
  try {
    const res = await fetch(`/api/realm?handle=${encodeURIComponent(handle)}`, { cache: "no-store" });
    if (res.status === 404) return { notFound: true };
    if (!res.ok) return { error: true };
    const world = fromWire<World>(await res.text());
    return world ? { world } : { error: true };
  } catch {
    return { error: true };
  }
}

/** A guild's clip bounties, or null when they can't be read right now. */
export async function fetchClipsClient(handle: string): Promise<ClipsData | null> {
  try {
    const res = await fetch(`/api/clips?handle=${encodeURIComponent(handle)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return fromWire<ClipsData>(await res.text());
  } catch {
    return null;
  }
}

export async function fetchMineClient(address: string): Promise<Mine | null> {
  try {
    const res = await fetch(`/api/mine?address=${encodeURIComponent(address)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return fromWire<Mine>(await res.text());
  } catch {
    return null;
  }
}

/**
 * Resolves true once the indexer has processed `block`, so the screen that is about to re-read the
 * live record will include the viewer's own transaction. Resolves false on timeout, or at once if
 * there is no indexer to wait for or it is minutes behind (the banner says so).
 */
export async function waitForIndexer(block: bigint, timeoutMs = 10_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch("/api/indexer/status", { cache: "no-store" });
      if (res.status === 503) return false;
      if (res.ok) {
        const status = (await res.json()) as Pick<IndexerStatus, "processedBlock" | "stalled">;
        if (BigInt(status.processedBlock) >= block) return true;
        if (status.stalled) return false; // it won't reach this block soon: don't hold the screen
      }
    } catch {
      // try again until the timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}
