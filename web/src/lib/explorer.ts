import { EXPLORER, explorerTx } from "./chain/config";

/** The "View on Monadscan" link for a toast, when an action produced a transaction. */
export function viewTx(tx: string | undefined): { label: string; href: string } | undefined {
  return tx ? { label: `View on ${EXPLORER.name}`, href: explorerTx(tx) } : undefined;
}
