import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  numberToHex,
  type Address,
  type Chain,
  type EIP1193Provider,
  type Hash,
} from "viem";
import { sepolia } from "viem/chains";
import { tipSenderAbi } from "../chain/abis";
import type { TipSource } from "../chain/config";
import { NATIVE, tipValue } from "./tip";

/**
 * The viewer's own wallet on the source chain (MetaMask, Rabby, ...), for cross-chain tips. Browser
 * only. This is separate from the jagomoko account: the tip is paid and credited by this wallet's
 * address, which needs a little Sepolia ETH.
 */

export interface InjectedWallet {
  id: string;
  name: string;
  /** a data: URI the wallet announces itself with (EIP-6963); shown in an <img>, never as HTML */
  icon?: string;
  provider: EIP1193Provider;
}

const CHAINS: Record<number, Chain> = { [sepolia.id]: sepolia };

const PUBLIC_RPC: Record<number, string> = { [sepolia.id]: "https://ethereum-sepolia-rpc.publicnode.com" };

/**
 * Lists the wallets in this browser. Modern wallets announce themselves (EIP-6963); an older one
 * only sets window.ethereum, which is used when nothing announced itself. Returns a stop function.
 */
export function discoverWallets(onChange: (wallets: InjectedWallet[]) => void): () => void {
  const found = new Map<string, InjectedWallet>();
  const announce = (e: Event) => {
    const d = (e as CustomEvent<{ info?: { uuid?: string; name?: string; icon?: string }; provider?: EIP1193Provider }>).detail;
    if (!d?.info?.uuid || !d.provider) return;
    const icon = typeof d.info.icon === "string" && d.info.icon.startsWith("data:image/") ? d.info.icon : undefined;
    found.set(d.info.uuid, { id: d.info.uuid, name: (d.info.name ?? "Wallet").slice(0, 40), icon, provider: d.provider });
    onChange([...found.values()]);
  };
  window.addEventListener("eip6963:announceProvider", announce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  const legacy = window.setTimeout(() => {
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (found.size === 0 && eth) {
      found.set("injected", { id: "injected", name: "Browser wallet", provider: eth });
      onChange([...found.values()]);
    }
  }, 400);
  return () => {
    window.removeEventListener("eip6963:announceProvider", announce);
    window.clearTimeout(legacy);
  };
}

/** Asks the wallet for an account (it shows its own approval screen). */
export async function connectWallet(wallet: InjectedWallet): Promise<Address> {
  const accounts = (await wallet.provider.request({ method: "eth_requestAccounts" })) as Address[];
  if (!accounts?.[0]) throw new Error("The wallet did not share an account.");
  return accounts[0];
}

/** Puts the wallet on the source chain, adding the chain first if the wallet does not know it. */
export async function switchChain(wallet: InjectedWallet, chainId: number): Promise<void> {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error("That chain is not supported.");
  const hex = numberToHex(chainId);
  try {
    await wallet.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await wallet.provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [PUBLIC_RPC[chainId]!],
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        },
      ],
    });
  }
}

export interface SentTip {
  hash: Hash;
  /** the LayerZero message id, to follow the tip until it lands on Monad */
  guid?: `0x${string}`;
}

/** Sends the tip from the viewer's wallet and waits for the source chain to confirm it. */
export async function sendTip(p: {
  wallet: InjectedWallet;
  account: Address;
  source: TipSource;
  wei: bigint;
  fee: bigint;
  creatorId: bigint;
  memo: string;
}): Promise<SentTip> {
  const chain = CHAINS[p.source.chainId];
  if (!chain) throw new Error("That chain is not supported.");
  const transport = custom(p.wallet.provider);
  const wallet = createWalletClient({ chain, transport, account: p.account });
  const hash = await wallet.writeContract({
    address: p.source.tipSender,
    abi: tipSenderAbi,
    functionName: "tip",
    args: [NATIVE, p.wei, p.creatorId, p.memo],
    value: tipValue(p.wei, p.fee),
  });
  const receipt = await createPublicClient({ chain, transport }).waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error("The tip was not accepted on Sepolia.");
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== p.source.tipSender.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: TIP_SENT_EVENT, data: log.data, topics: log.topics });
      if (ev.eventName === "TipSent") return { hash, guid: ev.args.guid };
    } catch {
      // another event of the sender
    }
  }
  return { hash };
}

/** Plain words for the wallet errors people actually hit. */
export function walletErrorMessage(error: unknown): string {
  const e = error as { code?: number; name?: string; shortMessage?: string; message?: string; cause?: { code?: number } };
  const code = e.code ?? e.cause?.code;
  const text = `${e.name ?? ""} ${e.shortMessage ?? ""} ${e.message ?? ""}`;
  if (code === 4001 || /UserRejected|rejected|denied/i.test(text)) return "You cancelled in your wallet.";
  if (/insufficient funds|InsufficientFunds|exceeds the balance/i.test(text)) return "Not enough Sepolia ETH in this wallet for the tip and the fee.";
  if (code === -32002) return "Your wallet already has a request open. Check it.";
  if (/TipTooSmall/.test(text)) return "That tip is under the minimum.";
  if (/TipTooLarge/.test(text)) return "That tip is over the maximum.";
  if (/StalePrice|BadPrice/.test(text)) return "The ETH price feed is out of date right now. Try again in a few minutes.";
  return e.shortMessage ?? "Something went wrong in the wallet. Try again.";
}

/** TipSent only: the app reads functions from the generated ABIs; this one event comes from the source chain. */
const TIP_SENT_EVENT = [
  {
    type: "event",
    name: "TipSent",
    inputs: [
      { name: "guid", type: "bytes32", indexed: true },
      { name: "creatorId", type: "uint256", indexed: true },
      { name: "donor", type: "address", indexed: true },
      { name: "asset", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "usdAmount", type: "uint256", indexed: false },
      { name: "memo", type: "string", indexed: false },
    ],
  },
] as const;
