import type { Hex } from "viem";

/**
 * The browser side of /api/profile (character names, kept off chain). Like the other readers these
 * never throw: a failure becomes null, or a sentence for the form.
 */

export type SavedName = { address: string; name: string };

/** Your own saved name, or null when there is none yet (or it can't be read right now). */
export async function fetchMyName(token: string): Promise<SavedName | null> {
  try {
    const res = await fetch("/api/profile", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    return res.ok ? ((await res.json()) as SavedName) : null;
  } catch {
    return null;
  }
}

export type SaveResult = { ok: true; value: SavedName } | { ok: false; error: string };

/** Saves a name the account signed (see profileMessage). */
export async function saveMyName(token: string, body: { address: string; name: string; issuedAt: number; signature: Hex }): Promise<SaveResult> {
  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Partial<SavedName> & { error?: string };
    if (res.ok && typeof json.name === "string" && typeof json.address === "string") return { ok: true, value: { address: json.address, name: json.name } };
    return { ok: false, error: json.error ?? "We couldn't save your name. Try again." };
  } catch {
    return { ok: false, error: "Can't reach jagomoko right now. Check your connection and try again." };
  }
}
