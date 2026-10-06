import { fromWire, type TipLanding, type TipQuote, type TipQuoteWire } from "./crosschain";

/** Browser side of /api/tip-quote and /api/tip-status (see lib/server/tip-routes.ts). */

export async function fetchTipQuote(p: { chainId: number; creatorId: string; usd: bigint; memoBytes: number }, signal?: AbortSignal): Promise<TipQuote> {
  const q = new URLSearchParams({ chain: String(p.chainId), creator: p.creatorId, usd: p.usd.toString(), memo: String(p.memoBytes) });
  const res = await fetch(`/api/tip-quote?${q}`, { cache: "no-store", signal });
  const body = (await res.json().catch(() => ({}))) as TipQuoteWire & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "The price can't be read right now.");
  return fromWire(body);
}

export async function fetchTipLanding(guid: string, signal?: AbortSignal): Promise<TipLanding> {
  const res = await fetch(`/api/tip-status?guid=${guid}`, { cache: "no-store", signal });
  if (!res.ok) return { status: "pending" };
  const body = (await res.json().catch(() => ({}))) as Partial<TipLanding>;
  return body.status === "landed" || body.status === "bounced" ? { status: body.status, txHash: body.txHash } : { status: "pending" };
}
