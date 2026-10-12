"use client";

import * as React from "react";
import { useCreateWallet, usePrivy, useWallets, type ConnectedWallet, type User } from "@privy-io/react-auth";
import { createWalletClient, custom, http, type Address, type Hash, type Hex } from "viem";
import { createSmartAccountClient } from "permissionless";
import { toKernelSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import type { Call } from "../chain/calls";
import { aaUrl, browserPublicClient } from "../chain/browser";
import { ENTRY_POINT_V07, monadTestnet } from "../chain/config";
import { FriendlyError, friendlyError } from "../chain/errors";

/**
 * The viewer's smart account: a Kernel account (ERC-4337, EntryPoint v0.7) owned by their Privy
 * embedded wallet. Gas is paid by Pimlico's paymaster through our /api/aa proxy, so a viewer never
 * holds or needs the network's own coin, and never sees a fee.
 */
export interface ViewerAccount {
  /** the smart account's address: this is the viewer's identity in the game */
  address: Address;
  /** runs the calls as ONE sponsored operation and resolves once it is included */
  send: (calls: Call[]) => Promise<{ hash: Hash; blockNumber: bigint }>;
  /** signs a message as the smart account (checked by others through ERC-1271, or ERC-6492 before the first transaction) */
  signMessage: (message: string) => Promise<Hex>;
}

export type AccountStatus =
  | { status: "off" }
  | { status: "starting" }
  | { status: "ready"; account: ViewerAccount }
  | { status: "error"; message: string };

async function build(wallet: ConnectedWallet, accessToken: () => Promise<string | null>): Promise<ViewerAccount> {
  await wallet.switchChain(monadTestnet.id);
  const provider = await wallet.getEthereumProvider();
  const owner = createWalletClient({ account: wallet.address as Address, chain: monadTestnet, transport: custom(provider as never) });

  const kernel = await toKernelSmartAccount({
    client: browserPublicClient(),
    version: "0.3.1",
    entryPoint: { address: ENTRY_POINT_V07, version: "0.7" },
    owners: [owner],
  });

  // every bundler and paymaster call carries the viewer's Privy session; the proxy refuses anonymous ones
  const transport = http(aaUrl(), {
    fetchFn: async (input, init) => {
      const token = await accessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
  });
  const entryPoint = { address: ENTRY_POINT_V07, version: "0.7" } as const;
  const pimlico = createPimlicoClient({ transport, entryPoint });
  const client = createSmartAccountClient({
    account: kernel,
    chain: monadTestnet,
    bundlerTransport: transport,
    paymaster: pimlico,
    userOperation: { estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast },
  });

  return {
    address: kernel.address,
    async send(calls) {
      const hash = await client.sendUserOperation({ calls: calls.map((c) => ({ to: c.to, data: c.data, value: c.value ?? 0n })) });
      const receipt = await client.waitForUserOperationReceipt({ hash, timeout: 60_000 });
      // a failed operation carries the revert payload in `reason`; friendlyError decodes it
      if (!receipt.success) throw new Error(`The operation reverted ${receipt.reason ?? ""}`);
      return { hash: receipt.receipt.transactionHash, blockNumber: receipt.receipt.blockNumber };
    },
    // no wallet screen: the embedded wallet signs silently (showWalletUIs is off)
    signMessage: (message) => kernel.signMessage({ message }),
  };
}

/** The account already has an embedded Ethereum wallet on record (even before the wallet list shows it). */
const hasEmbeddedWallet = (user: User) =>
  user.linkedAccounts.some((a) => a.type === "wallet" && a.chainType === "ethereum" && (a.walletClientType === "privy" || a.walletClientType === "privy-v2"));

export function useSmartAccount() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const embedded = wallets.find((w) => w.walletClientType === "privy");

  // Privy only makes the embedded wallet on sign-in through its own modal (createOnLogin). Our
  // sign-in is headless, so a new account gets its wallet here: once, and with no screen, since
  // showWalletUIs is off. A failure shows as the account's error instead of an endless "starting".
  const [walletError, setWalletError] = React.useState<string | null>(null);
  const creating = React.useRef(false);
  const missingWallet = ready && authenticated && !!user && !embedded && !hasEmbeddedWallet(user);
  React.useEffect(() => {
    if (!authenticated) {
      creating.current = false;
      setWalletError(null);
      return;
    }
    if (!missingWallet || creating.current) return;
    creating.current = true;
    createWallet().catch((error: unknown) => setWalletError(friendlyError(error)));
  }, [authenticated, missingWallet, createWallet]);

  const [state, setState] = React.useState<AccountStatus>({ status: "off" });
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const tokenRef = React.useRef(getAccessToken);
  tokenRef.current = getAccessToken;
  const walletRef = React.useRef(embedded);
  walletRef.current = embedded;

  // the wallet object changes identity on every render; its address is the stable key
  const owner = embedded?.address;
  React.useEffect(() => {
    if (!ready || !authenticated) {
      setState({ status: "off" });
      return;
    }
    if (walletError) {
      setState({ status: "error", message: walletError });
      return;
    }
    const wallet = walletRef.current;
    if (!walletsReady || !wallet) {
      setState({ status: "starting" });
      return;
    }
    let cancelled = false;
    setState({ status: "starting" });
    build(wallet, () => tokenRef.current()).then(
      (account) => {
        if (!cancelled) setState({ status: "ready", account });
      },
      (error) => {
        if (!cancelled) setState({ status: "error", message: friendlyError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, walletsReady, owner, walletError]);

  /** Waits (up to `timeoutMs`) for the account to finish starting, so a tap right after sign-in just works. */
  const whenReady = React.useCallback(async (timeoutMs = 30_000): Promise<ViewerAccount> => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const s = stateRef.current;
      if (s.status === "ready") return s.account;
      if (s.status === "error") throw new FriendlyError(s.message);
      if (s.status === "off") throw new FriendlyError("Sign in first.");
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    throw new FriendlyError("Your account is still starting. Try again in a moment.");
  }, []);

  return { state, whenReady };
}
