import { EXPLORER, explorerTx } from "./config";

/** The "View on Monadscan" link for a toast, when an action produced a transaction (shown in web3 only). */
export function viewTx(tx: string | undefined): { label: string; href: string; web3Only: true } | undefined {
  return tx ? { label: `View on ${EXPLORER.name}`, href: explorerTx(tx), web3Only: true } : undefined;
}
