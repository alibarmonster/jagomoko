import type { Address } from "viem";
import { cleanText, LIMITS } from "../sanitize";
import { ROLES, type Role } from "../roles";
import { characterAbi, juryAbi, usdAbi } from "./abis";
import { browserPublicClient } from "./browser";
import { CONTRACTS } from "./config";

export interface ViewerChainState {
  /** practice gold, in micro-dollars */
  balance: bigint;
  character: { role: Role; name: string; xp: bigint } | null;
  enlisted: boolean;
}

/** Everything the header, the character sheet and the jury page need about one account. */
export async function readViewer(address: Address): Promise<ViewerChainState> {
  const chain = browserPublicClient();
  const [balance, hasCharacter, enlisted] = await Promise.all([
    chain.readContract({ address: CONTRACTS.usd, abi: usdAbi, functionName: "balanceOf", args: [address] }),
    chain.readContract({ address: CONTRACTS.character, abi: characterAbi, functionName: "hasCharacter", args: [address] }),
    chain.readContract({ address: CONTRACTS.jury, abi: juryAbi, functionName: "isEnlisted", args: [address] }),
  ]);
  if (!hasCharacter) return { balance, character: null, enlisted };

  const profile = await chain.readContract({ address: CONTRACTS.character, abi: characterAbi, functionName: "profileOf", args: [address] });
  return {
    balance,
    enlisted,
    // names are written by anyone, so they are cleaned the same way as everything else we show
    character: { role: ROLES[profile.role] ?? "Knight", name: cleanText(profile.name, LIMITS.name).value, xp: profile.xp },
  };
}
