import { isOverlayKey } from "./key";
import { isTestKind, type TestKind } from "./test-alerts";

/** Browser-side calls for test alerts. They never throw: a failure is a false or a null. */

/** Studio: send a test alert to the overlay that has this key. Resolves with a sentence when it fails. */
export async function sendOverlayTest(key: string, kind: TestKind): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/overlay/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, kind }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? "Couldn’t send the test." };
  } catch {
    return { ok: false, error: "Couldn’t reach the server. Check your connection." };
  }
}

/** Overlay: the test alerts since `after` (omit it on the first read, which only returns the cursor). */
export async function readOverlayTests(key: string, after?: number): Promise<{ cursor: number; kinds: TestKind[] } | null> {
  if (!isOverlayKey(key)) return null;
  try {
    const query = `key=${encodeURIComponent(key)}${after === undefined ? "" : `&after=${after}`}`;
    const res = await fetch(`/api/overlay/test?${query}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { cursor?: unknown; events?: { kind?: unknown }[] };
    if (typeof body.cursor !== "number") return null;
    const kinds = (body.events ?? []).map((e) => e.kind).filter(isTestKind);
    return { cursor: body.cursor, kinds };
  } catch {
    return null;
  }
}
