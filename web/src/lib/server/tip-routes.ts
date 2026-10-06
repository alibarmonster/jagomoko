import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { tipSenderAbi } from "../chain/abis";
import { TIP_SOURCES, type TipSource } from "../chain/config";
import { MAX_MEMO_BYTES, NATIVE, isGuid, usdForWei, weiForUsd, type TipLanding, type TipQuoteWire } from "../crosschain/tip";
import { fetchTipLanding, indexerConfigured } from "../data/indexer";
import { SAMPLE_DATA } from "../config";
import { clientKey } from "./jsonrpc";
import type { RateLimiter } from "./ratelimit";

/**
 * Read-only routes for cross-chain tips. /api/tip-quote reads the TipSender on the source chain (the
 * ETH price it will use and the LayerZero fee) so the tip form can show both before a wallet is
 * connected; /api/tip-status says whether a sent tip has landed on Monad yet. Neither can move money.
 */

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const problem = (status: number, message: string, headers?: HeadersInit) => json({ error: message }, status, headers);

function limited(request: Request, limiter: RateLimiter): Response | null {
  const hit = limiter.take(clientKey(request));
  return hit.ok ? null : problem(429, "Slow down a little.", { "retry-after": String(hit.retryAfterSeconds) });
}

/** The few TipSender reads a quote needs. */
export interface SenderReader {
  usdValue(sender: Address, wei: bigint): Promise<bigint>;
  quote(sender: Address, wei: bigint, creatorId: bigint, memo: string): Promise<{ fee: bigint; usd: bigint }>;
  limits(sender: Address): Promise<{ minUsd: bigint; maxUsd: bigint }>;
}

const DIGITS = /^\d{1,20}$/;
/** $1,000: the contract's hard ceiling; anything above is not worth a read */
const MAX_USD = 1_000_000_000n;

/** GET /api/tip-quote?chain=11155111&creator=1&usd=5000000&memo=12 (memo = its length in bytes) */
export async function handleTipQuote(
  request: Request,
  limiter: RateLimiter,
  readerFor: (source: TipSource) => SenderReader,
  sources: TipSource[] = TIP_SOURCES,
): Promise<Response> {
  const slow = limited(request, limiter);
  if (slow) return slow;
  const q = new URL(request.url).searchParams;
  const source = sources.find((s) => String(s.chainId) === q.get("chain"));
  if (!source) return problem(404, "Tips from that chain aren't switched on.");
  const creator = q.get("creator") ?? "";
  const usd = q.get("usd") ?? "";
  const memo = Number(q.get("memo") ?? "0");
  if (!DIGITS.test(creator) || !DIGITS.test(usd)) return problem(400, "That is not a tip.");
  if (BigInt(usd) === 0n || BigInt(usd) > MAX_USD) return problem(400, "Pick an amount between $1 and $1,000.");
  if (!Number.isInteger(memo) || memo < 0 || memo > MAX_MEMO_BYTES) return problem(400, "That message is too long.");

  try {
    const read = readerFor(source);
    const [usdPerEth, limits] = await Promise.all([read.usdValue(source.tipSender, 10n ** 18n), read.limits(source.tipSender)]);
    const wei = weiForUsd(BigInt(usd), usdPerEth);
    // the fee depends on the message's size, not its words: a stand-in of the same length will do
    const { fee } = await read.quote(source.tipSender, wei, BigInt(creator), "x".repeat(memo));
    const body: TipQuoteWire = {
      chainId: source.chainId,
      usdPerEth: usdPerEth.toString(),
      wei: wei.toString(),
      fee: fee.toString(),
      usd: usdForWei(wei, usdPerEth).toString(),
      minUsd: limits.minUsd.toString(),
      maxUsd: limits.maxUsd.toString(),
    };
    return json(body);
  } catch {
    return problem(503, `${source.short} can't be read right now. Try again in a moment.`);
  }
}

/** GET /api/tip-status?guid=0x... : has the tip with this LayerZero guid reached Monad? */
export async function handleTipStatus(
  request: Request,
  limiter: RateLimiter,
  landing: (guid: string) => Promise<TipLanding> = fetchTipLanding,
): Promise<Response> {
  const slow = limited(request, limiter);
  if (slow) return slow;
  const guid = new URL(request.url).searchParams.get("guid") ?? "";
  if (!isGuid(guid)) return problem(400, "That is not a LayerZero message id.");
  if (SAMPLE_DATA || !indexerConfigured()) return json({ status: "pending" } satisfies TipLanding);
  try {
    return json(await landing(guid.toLowerCase()));
  } catch {
    return problem(503, "The live data is not reachable right now.");
  }
}

// ---- the real reader ---------------------------------------------------------------------------

/** Public RPCs for the source chains; an env var (SEPOLIA_RPC_URL) can point at a private one. */
function sourceClient(source: TipSource) {
  if (source.chainId !== sepolia.id) throw new Error(`no RPC for chain ${source.chainId}`);
  const url = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  return createPublicClient({ chain: sepolia, transport: http(url, { timeout: 8_000 }) });
}

const clients = new Map<number, ReturnType<typeof sourceClient>>();

export function chainSenderReader(source: TipSource): SenderReader {
  let client = clients.get(source.chainId);
  if (!client) {
    client = sourceClient(source);
    clients.set(source.chainId, client);
  }
  const c = client;
  return {
    usdValue: (sender, wei) => c.readContract({ address: sender, abi: tipSenderAbi, functionName: "usdValue", args: [NATIVE, wei] }),
    async quote(sender, wei, creatorId, memo) {
      const [fee, usd] = await c.readContract({ address: sender, abi: tipSenderAbi, functionName: "quote", args: [NATIVE, wei, creatorId, memo] });
      return { fee, usd };
    },
    async limits(sender) {
      const [minUsd, maxUsd] = await Promise.all([
        c.readContract({ address: sender, abi: tipSenderAbi, functionName: "minUsd" }),
        c.readContract({ address: sender, abi: tipSenderAbi, functionName: "maxUsd" }),
      ]);
      return { minUsd, maxUsd };
    },
  };
}
