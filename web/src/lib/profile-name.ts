/**
 * Character names live off chain. The chain only gets a stand-in ("Knight-7f3a"), so an
 * account's name is never written into the public record; jagomoko keeps the real one and shows it
 * (see lib/server/profiles.ts). These rules are shared by the form, the API and the data layer.
 */
import { getAddress } from "viem";
import type { Role } from "./roles";
import { cleanText, LIMITS } from "./sanitize";

/** Names nobody can take: what the screens call someone without a name, and the app's own names. */
const RESERVED = new Set(["anonymous", "a viewer", "moko", "jagomoko"]);
const STAND_IN = /^(knight|seer|judge|bard)-[0-9a-f]{4}$/i;

/** The case-insensitive form two names are compared by. */
export const nameKey = (name: string) => name.toLowerCase();

const isReserved = (name: string) => RESERVED.has(nameKey(name));

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

/** Cleans a name the way the screens will show it and says whether it can be taken. */
export function checkName(raw: string): NameCheck {
  const name = cleanText(raw, LIMITS.name).value;
  if (name.length === 0) return { ok: false, error: "Give your character a name." };
  if (isReserved(name) || STAND_IN.test(name)) return { ok: false, error: "That name is reserved. Pick another one." };
  return { ok: true, name };
}

/** What goes on chain instead of the name: the role and the start of the account, e.g. "Knight-7f3a". */
export function standIn(role: Role, address: string): string {
  return `${role}-${address.slice(2, 6).toLowerCase()}`;
}

/** How long a signed name change stays valid. */
export const PROFILE_MESSAGE_TTL_MS = 5 * 60_000;

/**
 * The text an account signs to set its name. The name, the account, the sign-in, the chain and the
 * time are all in it, so a signature cannot be reused for another name, account, user or chain, or
 * sent again later.
 */
export function profileMessage(p: { address: string; name: string; userId: string; chainId: number; issuedAt: number }): string {
  return [
    "jagomoko: set my character name",
    `Name: ${p.name}`,
    `Account: ${getAddress(p.address)}`,
    `Signed in as: ${p.userId}`,
    `Chain: ${p.chainId}`,
    `Issued: ${new Date(p.issuedAt).toISOString()}`,
  ].join("\n");
}

/** Who holds which name (from the profile store). */
export interface NameBook {
  /** the name this account chose, if any */
  nameOf(address: string): string | undefined;
  /** the account holding this name key, if any */
  holderOf(key: string): string | undefined;
}

export const EMPTY_NAME_BOOK: NameBook = { nameOf: () => undefined, holderOf: () => undefined };

/**
 * The name to show for a character: the one they chose, else what is on chain. An on-chain name that
 * is reserved, or that someone else chose, shows as the stand-in instead, so minting straight from
 * the contract (with any name at all) cannot pass for another viewer.
 */
export function displayName(p: { id: string; name: string; role: Role }, book: NameBook): string {
  const chosen = book.nameOf(p.id);
  if (chosen) return chosen;
  const holder = book.holderOf(nameKey(p.name));
  const someoneElses = holder !== undefined && holder.toLowerCase() !== p.id.toLowerCase();
  return isReserved(p.name) || someoneElses ? standIn(p.role, p.id) : p.name;
}

/** `displayName` for a list of players. */
export function applyNames<T extends { id: string; name: string; role: Role }>(players: T[], book: NameBook): T[] {
  return players.map((p) => ({ ...p, name: displayName(p, book) }));
}
