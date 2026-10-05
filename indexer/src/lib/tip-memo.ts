import { cleanText, LIMITS } from "./sanitize.js";

/**
 * A tipper can hide their name. The contract has no such flag, so the web app puts this marker at
 * the start of the tip's message and the indexer reads it here. The chain still records which
 * account tipped; "anonymous" only hides the name inside jagomoko (stream, feed, studio).
 */
export const ANON_MARKER = "[anon]";

/** Stands in for the tipper on an anonymous tip's activity, so no screen can show who it was. */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type TipMemo = { anonymous: boolean; memo: string; changed: boolean };

/** Splits a tip's raw message into the anonymous flag and the sanitized message (marker removed). */
export function readTipMemo(raw: string): TipMemo {
  const text = typeof raw === "string" ? raw : "";
  const head = text.trimStart();
  const anonymous = head.slice(0, ANON_MARKER.length).toLowerCase() === ANON_MARKER;
  const rest = anonymous ? head.slice(ANON_MARKER.length) : text;
  const cleaned = cleanText(rest, LIMITS.memo);
  return { anonymous, memo: cleaned.value, changed: cleaned.changed };
}
