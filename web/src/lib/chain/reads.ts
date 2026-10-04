import { keccak256, toBytes, type Address } from "viem";
import { cleanText, LIMITS } from "../sanitize";
import { ROLES, type Role } from "../roles";
import { characterAbi, juryAbi, registryAbi, usdAbi } from "./abis";
import { browserPublicClient } from "./browser";
import { CONTRACTS } from "./config";

export interface ViewerChainState {
  /** practice gold, in micro-dollars */
  balance: bigint;
  character: { role: Role; name: string; xp: bigint } | null;
  enlisted: boolean;
  /** the realm this account owns (a streamer), if any */
  realm: { creatorId: bigint; handle: string } | null;
}

/** Everything the header, the character sheet and the jury page need about one account. */
export async function readViewer(address: Address): Promise<ViewerChainState> {
  const chain = browserPublicClient();
  const [balance, hasCharacter, enlisted, realmId] = await Promise.all([
    chain.readContract({ address: CONTRACTS.usd, abi: usdAbi, functionName: "balanceOf", args: [address] }),
    chain.readContract({ address: CONTRACTS.character, abi: characterAbi, functionName: "hasCharacter", args: [address] }),
    chain.readContract({ address: CONTRACTS.jury, abi: juryAbi, functionName: "isEnlisted", args: [address] }),
    chain.readContract({ address: CONTRACTS.registry, abi: registryAbi, functionName: "idOfOwner", args: [address] }),
  ]);
  const realm =
    realmId === 0n
      ? null
      : {
          creatorId: realmId,
          handle: await chain.readContract({ address: CONTRACTS.registry, abi: registryAbi, functionName: "handleOf", args: [realmId] }),
        };
  if (!hasCharacter) return { balance, character: null, enlisted, realm };

  const profile = await chain.readContract({ address: CONTRACTS.character, abi: characterAbi, functionName: "profileOf", args: [address] });
  return {
    balance,
    enlisted,
    realm,
    // names are written by anyone, so they are cleaned the same way as everything else we show
    character: { role: ROLES[profile.role] ?? "Knight", name: cleanText(profile.name, LIMITS.name).value, xp: profile.xp },
  };
}

/** Is this exact handle already a realm? (Handles are lowercase, so this is also the case-insensitive check.) */
export async function isHandleTaken(handle: string): Promise<boolean> {
  const id = await browserPublicClient().readContract({
    address: CONTRACTS.registry,
    abi: registryAbi,
    functionName: "idOfHandle",
    args: [keccak256(toBytes(handle))],
  });
  return id !== 0n;
}
