import { formatUnits } from "viem";

/**
 * Cross-chain tips (contract v2): a viewer pays in ETH on another chain (Sepolia first), TipSender
 * prices it in USD with Chainlink and LayerZero carries it to TipReceiver on Monad, which credits
 * the creator's split. Pure helpers shared by the server routes and the screens.
 */

/** TipSender's stand-in address for the chain's own coin. */
export const NATIVE = "0x0000000000000000000000000000000000000000" as const;

/** The LayerZero fee moves a little between the quote and the send; any extra is refunded. */
export const FEE_BUFFER_BPS = 1_000n;

/** The smallest wei worth at least `usd` (6 decimals) at `usdPerEth` (USD for 1 ETH, 6 decimals). */
export function weiForUsd(usd: bigint, usdPerEth: bigint): bigint {
  if (usdPerEth <= 0n) throw new Error("no ETH price");
  return (usd * 10n ** 18n + usdPerEth - 1n) / usdPerEth;
}

/** What `wei` is worth, the way TipSender rounds it (down). */
export function usdForWei(wei: bigint, usdPerEth: bigint): bigint {
  return (wei * usdPerEth) / 10n ** 18n;
}

/** msg.value for a native tip: the tip itself plus the quoted fee and a margin the endpoint refunds. */
export function tipValue(wei: bigint, fee: bigint): bigint {
  return wei + fee + (fee * FEE_BUFFER_BPS) / 10_000n;
}

/** "0.00185" / "0.000102": at least three significant digits, never a wall of zeros. */
export function formatEth(wei: bigint, digits = 5): string {
  const [whole, frac = ""] = formatUnits(wei, 18).split(".");
  const firstSignificant = frac.search(/[1-9]/);
  const keep = firstSignificant === -1 ? 0 : Math.max(digits, firstSignificant + 3); // at least 3 significant digits
  const cut = frac.slice(0, keep).replace(/0+$/, "");
  return cut ? `${whole}.${cut}` : whole!;
}

/** UTF-8 length, which is what TipSender's 200-byte memo limit counts. */
export const memoBytes = (memo: string) => new TextEncoder().encode(memo).length;

export const MAX_MEMO_BYTES = 200;

export const layerZeroScanTx = (hash: string) => `https://testnet.layerzeroscan.com/tx/${hash}`;

export const isGuid = (value: string) => /^0x[0-9a-fA-F]{64}$/.test(value);

/** What /api/tip-quote answers: everything in base units, as strings (JSON has no bigint). */
export interface TipQuoteWire {
  chainId: number;
  /** USD for 1 ETH, 6 decimals */
  usdPerEth: string;
  wei: string;
  fee: string;
  /** what `wei` is worth at that price */
  usd: string;
  minUsd: string;
  maxUsd: string;
}

export interface TipQuote {
  chainId: number;
  usdPerEth: bigint;
  wei: bigint;
  fee: bigint;
  usd: bigint;
  minUsd: bigint;
  maxUsd: bigint;
}

export const fromWire = (q: TipQuoteWire): TipQuote => ({
  chainId: q.chainId,
  usdPerEth: BigInt(q.usdPerEth),
  wei: BigInt(q.wei),
  fee: BigInt(q.fee),
  usd: BigInt(q.usd),
  minUsd: BigInt(q.minUsd),
  maxUsd: BigInt(q.maxUsd),
});

export type TipLanding = { status: "landed" | "bounced" | "pending"; txHash?: string };
