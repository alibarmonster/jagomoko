/**
 * Money is a bigint of micro-dollars (6 decimals) — the same base units the
 * on-chain token uses — so UI math matches contract math exactly.
 */
export type Usd = bigint;

export const UNIT = 1_000_000n;
export const BPS = 10_000n;

/** Whole or fractional dollars -> micro-dollars (for fixtures and tests). */
export const usd = (dollars: number): Usd => BigInt(Math.round(dollars * 1_000_000));

export type FormatUsdOptions = {
  /** auto: hide ".00"; always: 2 decimals (aligned legends); never: whole dollars */
  cents?: "auto" | "always" | "never";
  /** 1,234 -> 1.2k */
  compact?: boolean;
  signed?: boolean;
};

const group = (n: bigint) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Rounds half-up to the cent for display. */
export function formatUsd(amount: Usd, { cents = "auto", compact = false, signed = false }: FormatUsdOptions = {}): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const sign = negative ? "−" : signed && abs > 0n ? "+" : "";

  if (compact && abs >= 1_000n * UNIT) {
    const k = 1_000n * UNIT;
    const tenths = (abs * 10n + k / 2n) / k; // thousands with one decimal, rounded
    const whole = tenths / 10n;
    const dec = tenths % 10n;
    return `${sign}$${whole}${dec === 0n ? "" : `.${dec}`}k`;
  }

  const totalCents = (abs + 5_000n) / 10_000n; // round half up to the cent
  const whole = totalCents / 100n;
  const frac = totalCents % 100n;
  const showCents = cents === "always" || (cents === "auto" && frac !== 0n);
  return `${sign}$${group(whole)}${showCents ? `.${frac.toString().padStart(2, "0")}` : ""}`;
}

/** Parses user input ("$12.5", "1,200") into micro-dollars. Returns null when invalid. */
export function parseUsd(input: string): Usd | null {
  const cleaned = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{0,6})?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  return BigInt(whole) * UNIT + BigInt(frac.padEnd(6, "0"));
}

export const formatInt = (n: number | bigint) => group(BigInt(n));
