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
}

const KEYS: Record<Exclude<keyof Contracts, "clips">, string> = {
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
 * Reads and validates a deployment file ({ contracts: { MockUSD: "0x..", .. } }). ClipBoard came
 * later than the rest, so a deployment without it still loads, with clip bounties switched off.
 */
export function parseContracts(raw: Record<string, string | undefined>): Contracts {
  const out = { clips: zeroAddress as Address } as Contracts;
  for (const [field, key] of Object.entries(KEYS) as [Exclude<keyof Contracts, "clips">, string][]) {
    const value = raw[key];
    if (!value || !isAddress(value, { strict: false })) throw new Error(`deployment.json: ${key} is not an address`);
    out[field] = value as Address;
  }
  const clips = raw.ClipBoard;
  if (clips !== undefined) {
    if (!isAddress(clips, { strict: false })) throw new Error("deployment.json: ClipBoard is not an address");
    out.clips = clips as Address;
  }
  return out;
}

export const CONTRACTS: Contracts = parseContracts(deployment.contracts);

/** False until `bun run sync:deployment` copies a real deployment in. */
export const DEPLOYED = deployment.deployed && CONTRACTS.vault !== zeroAddress;

/** Clip bounties work once ClipBoard is deployed and synced in. */
export const CLIPS_LIVE = DEPLOYED && CONTRACTS.clips !== zeroAddress;

/**
 * The contracts a viewer or creator may call through sponsored gas. Anything else is refused by the
 * sponsorship proxy, so the gas budget can only be spent on jagomoko itself.
 */
export function sponsoredTargets(c: Contracts): Address[] {
  const targets = [c.usd, c.registry, c.character, c.vault, c.jury, c.quests, c.battles, c.treasury];
  return c.clips === zeroAddress ? targets : [...targets, c.clips];
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
