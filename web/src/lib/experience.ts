import type { Activity } from "./data/types";
import { load, save } from "./utils/persist";

/**
 * How much of the blockchain the screens show. Everything runs on Monad either way; only the
 * receipts differ.
 *   web2 (the default): it feels like any app. A tip is just "sent"; no transaction links,
 *         account addresses, contracts, chains or token names.
 *   web3: the receipts are on screen. Explorer links, the account's address, the contracts
 *         behind the treasury and the pool, and where a cross-chain tip came from.
 * The choice lives in this browser (localStorage). The stream overlay takes it from its URL
 * (?mode=web3), since OBS has its own browser.
 */
export type Experience = "web2" | "web3";

export const EXPERIENCES: readonly Experience[] = ["web2", "web3"];
export const DEFAULT_EXPERIENCE: Experience = "web2";
const STORAGE_KEY = "jagomoko.experience";

export const isExperience = (value: unknown): value is Experience => value === "web2" || value === "web3";

let current: Experience | null = null;
const listeners = new Set<() => void>();

/** The experience this browser chose (the default until it chooses). */
export function getExperience(): Experience {
  if (current === null) {
    const saved = typeof window === "undefined" ? null : load<string>(STORAGE_KEY);
    current = isExperience(saved) ? saved : DEFAULT_EXPERIENCE;
  }
  return current;
}

export function setExperience(next: Experience): void {
  if (next === getExperience()) return;
  current = next;
  save(STORAGE_KEY, next);
  for (const listener of listeners) listener();
}

/** Calls `listener` whenever the experience changes, here or in another tab. */
export function subscribeExperience(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    current = null; // re-read what the other tab saved
    listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** A wallet address standing in for a name (a tip from another chain, from someone without a character). */
const WALLET_NAME = /^0x[0-9a-f]{4}/i;

/**
 * An activity as a web2 screen shows it: no chain it came from, and no wallet address for a name.
 * A web3 screen shows it as it is.
 */
export function forExperience(a: Activity, experience: Experience): Activity {
  if (experience === "web3" || a.via === undefined) return a;
  const wallet = !a.anonymous && WALLET_NAME.test(a.actorName ?? "");
  return {
    ...a,
    via: undefined,
    actorName: wallet ? "A viewer" : a.actorName,
    // the indexer's sentence for a bounced tip names the other chain; a tip's text is the tipper's own words
    text: a.kind === "TipBounced" ? a.text.replace(" from another chain", "") : a.text,
  };
}
