/**
 * A realm handle is what appears in the address (/c/karambol) and on every card.
 *
 * The contract only checks the length (2-32 bytes) and exact-match uniqueness, so "Karambol" and
 * "karambol" would be two different realms with the same address on the web. We close that gap by
 * only ever registering lowercase handles: then the contract's own uniqueness check is a
 * case-insensitive one.
 */
export const HANDLE_MIN = 2;
export const HANDLE_MAX = 32;

const VALID = /^[a-z0-9_]+$/;

/** What the input shows while someone types: lowercase, no spaces, no characters we would reject. */
export function normalizeHandleInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, HANDLE_MAX);
}

export type HandleCheck = { ok: true; handle: string } | { ok: false; error: string };

export function validateHandle(raw: string): HandleCheck {
  const handle = raw.trim().toLowerCase();
  if (handle.length < HANDLE_MIN) return { ok: false, error: `Use at least ${HANDLE_MIN} characters.` };
  if (handle.length > HANDLE_MAX) return { ok: false, error: `Use at most ${HANDLE_MAX} characters.` };
  if (!VALID.test(handle)) return { ok: false, error: "Use lowercase letters, numbers and underscores only." };
  return { ok: true, handle };
}
