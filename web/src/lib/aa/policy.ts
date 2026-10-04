import { isAddress, isHex, zeroAddress, type Address } from "viem";
import { decode7579Calls } from "permissionless/utils";

/**
 * What the sponsored-gas budget may pay for. The Pimlico key lives on the server, behind /api/aa;
 * this policy is what stops that endpoint from becoming a free gas faucet for anything else.
 *
 * A user operation is sponsored only when ALL of these hold:
 *  - it is an ordinary Kernel `execute` (single or batch), never a delegatecall or a module install
 *  - every call goes to a jagomoko contract (the target allowlist)
 *  - no call moves native value
 *  - a new account is created by one of the known Kernel factories
 *  - it stays small (a bounded number of calls and calldata size)
 */
export interface Policy {
  entryPoint: Address;
  chainId: number;
  /** factories allowed to create a viewer's account on their first action */
  factories: readonly Address[];
  /** the only contracts a sponsored call may reach */
  targets: readonly Address[];
  maxCalls: number;
  maxCallDataBytes: number;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

const deny = (reason: string): Verdict => ({ ok: false, reason });
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const inList = (list: readonly Address[], address: string) => list.some((a) => same(a, address));

export function checkUserOperation(op: unknown, policy: Policy): Verdict {
  if (!op || typeof op !== "object") return deny("Malformed operation");
  const { sender, callData, factory } = op as Record<string, unknown>;

  if (typeof sender !== "string" || !isAddress(sender, { strict: false })) return deny("Missing sender");
  if (typeof callData !== "string" || !isHex(callData)) return deny("Missing call data");
  if ((callData.length - 2) / 2 > policy.maxCallDataBytes) return deny("Operation is too large");

  // a first-time account is deployed by the userOp itself; only the known factories are paid for
  if (factory !== undefined && factory !== null && !same(String(factory), zeroAddress)) {
    if (typeof factory !== "string" || !inList(policy.factories, factory)) return deny("Unknown account factory");
  }

  let decoded: ReturnType<typeof decode7579Calls>;
  try {
    decoded = decode7579Calls(callData);
  } catch {
    return deny("Unsupported account call");
  }
  if (decoded.mode.type === "delegatecall") return deny("Delegate calls are not allowed");
  const calls = decoded.callData;
  if (calls.length === 0) return deny("No calls");
  if (calls.length > policy.maxCalls) return deny("Too many calls in one operation");

  for (const call of calls) {
    if (call.value !== 0n) return deny("Calls may not carry value");
    if (!inList(policy.targets, call.to)) return deny("That contract is not covered");
  }
  return { ok: true };
}

/** JSON-RPC methods the bundler/paymaster proxy forwards, and which parameters to inspect. */
export interface MethodRule {
  /** params[0] is a user operation to check against the policy */
  userOp?: boolean;
  /** params[1] must be our EntryPoint */
  entryPoint?: boolean;
  /** this call makes the paymaster commit to paying (counted against the sponsorship budget) */
  sponsors?: boolean;
  /** index of the paymaster context object, where the sponsorship policy id is injected */
  contextIndex?: number;
  /** index of a hex chain id that must match */
  chainIdIndex?: number;
}

export const METHODS: Record<string, MethodRule> = {
  eth_chainId: {},
  eth_supportedEntryPoints: {},
  eth_getUserOperationByHash: {},
  eth_getUserOperationReceipt: {},
  pimlico_getUserOperationGasPrice: {},
  pimlico_getUserOperationStatus: {},
  eth_estimateUserOperationGas: { userOp: true, entryPoint: true },
  eth_sendUserOperation: { userOp: true, entryPoint: true },
  pm_getPaymasterStubData: { userOp: true, entryPoint: true, contextIndex: 3, chainIdIndex: 2 },
  pm_getPaymasterData: { userOp: true, entryPoint: true, sponsors: true, contextIndex: 3, chainIdIndex: 2 },
  pm_sponsorUserOperation: { userOp: true, entryPoint: true, sponsors: true, contextIndex: 2 },
};

/** Checks the parameters of an allowed method. */
export function checkRequestParams(rule: MethodRule, params: unknown[], policy: Policy): Verdict {
  if (rule.userOp) {
    const verdict = checkUserOperation(params[0], policy);
    if (!verdict.ok) return verdict;
  }
  if (rule.entryPoint) {
    const ep = params[1];
    if (typeof ep !== "string" || !same(ep, policy.entryPoint)) return deny("Unsupported entry point");
  }
  if (rule.chainIdIndex !== undefined) {
    const id = params[rule.chainIdIndex];
    if (id !== undefined && (typeof id !== "string" || Number(id) !== policy.chainId)) return deny("Wrong network");
  }
  return { ok: true };
}
