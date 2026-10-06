/**
 * "Hide my name" on a tip. The contract has no such option, so a marker goes at the start of the
 * tip's message and the indexer (indexer/src/lib/tip-memo.ts) reads it. The chain still records
 * which account tipped; the marker only hides the name inside jagomoko.
 */
export const ANON_MARKER = "[anon]";

/** The message to send on chain. A marker typed by hand is dropped: only the switch decides. */
export function tipMemo(text: string, anonymous: boolean): string {
  const head = text.trimStart();
  const typed = head.slice(0, ANON_MARKER.length).toLowerCase() === ANON_MARKER;
  const body = (typed ? head.slice(ANON_MARKER.length) : text).trim();
  return anonymous ? `${ANON_MARKER}${body ? ` ${body}` : ""}` : body;
}
