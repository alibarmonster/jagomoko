import { defineChain, isAddress, zeroAddress, type Address } from "viem";
import { monadTestnet as viemMonadTestnet } from "viem/chains";
import deployment from "./deployment.json";

/** Monad testnet. Links go to Monadscan (Etherscan's explorer for Monad), where the contracts are verified. */
export const monadTestnet = defineChain({
  ...viemMonadTestnet,
  blockExplorers: { default: { name: "Monadscan", url: "https://testnet.monadscan.com" } },
});

export const CHAIN_ID = monadTestnet.id;

/** Public fallback RPC. The browser never talks to an RPC directly: it goes through /api/rpc. */
export const PUBLIC_RPC_URL = "https://testnet-rpc.monad.xyz";

/** ERC-4337 EntryPoint v0.7: the same address on every chain, including Monad. */
export const ENTRY_POINT_V07: Address = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

/**
 * Kernel v0.3.1 factories that deploy a viewer's smart account on their first action.
 * These are the defaults of permissionless.js (KERNEL_VERSION_TO_ADDRESSES_MAP["0.3.1"]); the
 * sponsorship proxy only pays for accounts created by one of them.
 */
export const KERNEL_META_FACTORY: Address = "0xd703aaE79538628d27099B8c4f621bE4CCd142d5";
export const KERNEL_FACTORY: Address = "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419";

export interface Contracts {
  usd: Address;
  yieldVault: Address;
  registry: Address;
  character: Address;
  vault: Address;
  jury: Address;
  quests: Address;
  battles: Address;
  treasury: Address;
  /** clip bounties; the zero address until ClipBoard is deployed (see CLIPS_LIVE) */
  clips: Address;
  /** v2, zero until DeployV2 runs (see POOL_LIVE): the Community Pool and its liquid staking leg */
  pool: Address;
  lstLeg: Address;
  lst: Address;
  swap: Address;
  /** v2: the Monad end of cross-chain tips (see CROSSCHAIN_LIVE) */
  tipReceiver: Address;
  /** the $100 practice gold tap; zero until DeployPracticeFaucet runs (MockUSD's own faucet gives $10) */
  practiceFaucet: Address;
}

/** contracts that came after the first deployment: a file without them still loads */
const OPTIONAL_KEYS = {
  clips: "ClipBoard",
  pool: "CommunityPoolVault",
  lstLeg: "LstStrategy",
  lst: "MockLST",
  swap: "MokoSwap",
  tipReceiver: "TipReceiver",
  practiceFaucet: "PracticeFaucet",
} as const;
type OptionalField = keyof typeof OPTIONAL_KEYS;

const KEYS: Record<Exclude<keyof Contracts, OptionalField>, string> = {
  usd: "MockUSD",
  yieldVault: "MockYieldVault",
  registry: "CreatorRegistry",
  character: "Character",
  vault: "SplitVault",
  jury: "Jury",
  quests: "QuestEscrow",
  battles: "PredictionBattle",
  treasury: "CommunityTreasury",
};

/**
 * Reads and validates a deployment file ({ contracts: { MockUSD: "0x..", .. } }). ClipBoard and the
 * v2 contracts came later than the rest, so a deployment without them still loads, with those
 * features switched off (their fields are the zero address).
 */
export function parseContracts(raw: Record<string, string | undefined>): Contracts {
  const out = {} as Contracts;
  for (const [field, key] of Object.entries(KEYS) as [Exclude<keyof Contracts, OptionalField>, string][]) {
    const value = raw[key];
    if (!value || !isAddress(value, { strict: false })) throw new Error(`deployment.json: ${key} is not an address`);
    out[field] = value as Address;
  }
  for (const [field, key] of Object.entries(OPTIONAL_KEYS) as [OptionalField, string][]) {
    const value = raw[key];
    if (value !== undefined && !isAddress(value, { strict: false })) throw new Error(`deployment.json: ${key} is not an address`);
    out[field] = (value ?? zeroAddress) as Address;
  }
  return out;
}

/** A chain a viewer can tip from: its TipSender sends the tip to TipReceiver on Monad over LayerZero. */
export interface TipSource {
  chainId: number;
  /** its LayerZero endpoint id (what the index stores as a tip's `via`) */
  eid: number;
  name: string;
  short: string;
  explorer: string;
  tipSender: Address;
}

export function parseSources(raw: unknown): TipSource[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s): TipSource[] => {
    if (!s || typeof s !== "object") return [];
    const o = s as Record<string, unknown>;
    const ok =
      typeof o.chainId === "number" &&
      typeof o.eid === "number" &&
      typeof o.name === "string" &&
      typeof o.short === "string" &&
      typeof o.explorer === "string" &&
      typeof o.tipSender === "string" &&
      isAddress(o.tipSender, { strict: false });
    return ok ? [{ chainId: o.chainId as number, eid: o.eid as number, name: o.name as string, short: o.short as string, explorer: o.explorer as string, tipSender: o.tipSender as Address }] : [];
  });
}

export const CONTRACTS: Contracts = parseContracts(deployment.contracts);

/** False until `bun run sync:deployment` copies a real deployment in. */
export const DEPLOYED = deployment.deployed && CONTRACTS.vault !== zeroAddress;

/** Clip bounties work once ClipBoard is deployed and synced in. */
export const CLIPS_LIVE = DEPLOYED && CONTRACTS.clips !== zeroAddress;

/** The Community Pool (treasury yield) works once DeployV2 is deployed and synced in. */
export const POOL_LIVE = DEPLOYED && CONTRACTS.pool !== zeroAddress && CONTRACTS.lstLeg !== zeroAddress;

/** Practice gold comes $100 at a time once PracticeFaucet is deployed and synced in ($10 from MockUSD before). */
export const FAUCET_LIVE = DEPLOYED && CONTRACTS.practiceFaucet !== zeroAddress;

/** Where a viewer can tip from, other than Monad itself. */
export const TIP_SOURCES: TipSource[] = parseSources((deployment as { sources?: unknown }).sources);

/** Cross-chain tips work once TipReceiver and at least one TipSender are deployed and synced in. */
export const CROSSCHAIN_LIVE = DEPLOYED && CONTRACTS.tipReceiver !== zeroAddress && TIP_SOURCES.length > 0;

/** The source chain a tip came from, by the LayerZero endpoint id the index stores. */
export const sourceByEid = (eid: number | undefined | null) =>
  eid === undefined || eid === null ? undefined : (TIP_SOURCES.find((s) => s.eid === eid) ?? KNOWN_SOURCES[eid]);

/** names for endpoint ids even before (or after) a sender is synced in, so old tips keep their label */
const KNOWN_SOURCES: Record<number, { name: string; short: string }> = {
  40161: { name: "Ethereum Sepolia", short: "Sepolia" },
  40245: { name: "Base Sepolia", short: "Base Sepolia" },
  40231: { name: "Arbitrum Sepolia", short: "Arbitrum Sepolia" },
};

/**
 * The contracts a viewer or creator may call through sponsored gas. Anything else is refused by the
 * sponsorship proxy, so the gas budget can only be spent on jagomoko itself.
 */
export function sponsoredTargets(c: Contracts): Address[] {
  const targets = [c.usd, c.registry, c.character, c.vault, c.jury, c.quests, c.battles, c.treasury];
  // later contracts join once they exist (the pool: anyone may rebalance it, the curator sets its mix)
  return [...targets, ...[c.clips, c.pool, c.practiceFaucet].filter((a) => a !== zeroAddress)];
}

export const EXPLORER = monadTestnet.blockExplorers.default;

export const explorerTx = (hash: string) => `${EXPLORER.url}/tx/${hash}`;

/**
 * An account or contract page. Every action is a sponsored (ERC-4337) operation sent to the
 * EntryPoint, so explorers don't list it under the account's own transactions; `tokens` opens the
 * token transfers instead, where money moved by those operations does show.
 */
export const explorerAddress = (address: string, opts: { tokens?: boolean } = {}) =>
  `${EXPLORER.url}/address/${address}${opts.tokens ? "#tokentxns" : ""}`;
