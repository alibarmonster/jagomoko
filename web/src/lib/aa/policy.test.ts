import { describe, expect, it } from "vitest";
import { encodeFunctionData, getAddress, zeroAddress, type Address, type Hex } from "viem";
import { encode7579Calls } from "permissionless/utils";
import { usdAbi } from "../chain/abis";
import { createCalls, type Call } from "../chain/calls";
import { sponsoredTargets, type Contracts, ENTRY_POINT_V07, KERNEL_FACTORY, KERNEL_META_FACTORY } from "../chain/config";
import { checkRequestParams, checkUserOperation, METHODS, type Policy } from "./policy";

const addr = (n: number): Address => getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const C: Contracts = {
  usd: addr(1),
  yieldVault: addr(2),
  registry: addr(3),
  character: addr(4),
  vault: addr(5),
  jury: addr(6),
  quests: addr(7),
  battles: addr(8),
  treasury: addr(9),
  clips: addr(10),
};
const calls = createCalls(C);
const USD = 1_000_000n;

const POLICY: Policy = {
  entryPoint: ENTRY_POINT_V07,
  chainId: 10143,
  factories: [KERNEL_META_FACTORY, KERNEL_FACTORY],
  targets: sponsoredTargets(C),
  maxCalls: 6,
  maxCallDataBytes: 16_384,
};

/** Encodes calls exactly like permissionless' Kernel account does (single call vs batch). */
function kernelCallData(list: Call[], type?: "call" | "batchcall" | "delegatecall"): Hex {
  return encode7579Calls({
    mode: { type: type ?? (list.length > 1 ? "batchcall" : "call"), revertOnError: false, selector: "0x", context: "0x" },
    callData: list,
  });
}

const op = (callData: Hex, extra: Record<string, unknown> = {}) => ({ sender: addr(99), nonce: "0x0", callData, ...extra });

describe("checkUserOperation: what gets sponsored", () => {
  it("accepts every real viewer action", () => {
    const actions: Call[][] = [
      calls.faucet(),
      calls.mintCharacter("Knight", "Ada"),
      calls.tip(1n, 5n * USD, "gg"),
      calls.backQuest(3n, 10n * USD),
      calls.joinBattle(2n, 0, 0n, true),
      calls.joinBattle(2n, 1, 4n * USD, false),
      calls.claimQuest(3n),
      calls.claimBattle(2n),
      calls.disputeQuest(3n),
      calls.enlist(),
      calls.resolveJuryCase(1n),
      calls.executeProposal(1n),
      calls.voteJury(1n, "yes"),
      calls.voteProposal(1n, true),
      calls.proposeSpend(1n, addr(42), 20n * USD, "Clip bounty"),
      calls.proposeAllocation(1n, 2_500, "Put a quarter to work"),
      calls.rebalanceTreasury(1n),
      // the streamer side
      calls.registerCreator("karambol", { creatorBps: 9_800, treasuryBps: 100, communityBps: 100 }),
      calls.queueSplit(1n, { creatorBps: 9_000, treasuryBps: 500, communityBps: 500 }),
      calls.applySplit(1n),
      calls.setModerator(1n, addr(77), true),
      calls.createQuest(1n, "Beat the boss", 1_800_000_000n),
      calls.createBattle(1n, "Win?", "Win", "Lose", 1_800_000_300n, false),
      calls.proposeQuestOutcome(1n, true, "https://youtu.be/x"),
      calls.proposeBattleOutcome(1n, true, "https://youtu.be/y"),
      calls.finalizeQuest(1n),
      calls.finalizeBattle(1n),
      calls.withdrawEarnings(1n, addr(55)),
      // clip bounties
      calls.createBounty(1n, "Best clip", 25n * USD, 1_800_000_000n, 1_800_003_600n),
      calls.askCommunity(1n, 20n * USD, "Clip bounty pool"),
      calls.fundBounty(1n, 2n),
      calls.returnPayout(2n),
      calls.submitClip(1n, "https://youtu.be/dQw4w9WgXcQ"),
      calls.voteClip(1n),
      calls.hideClip(1n, true),
      calls.finalizeBounty(1n),
    ];
    for (const list of actions) expect(checkUserOperation(op(kernelCallData(list)), POLICY)).toEqual({ ok: true });
  });

  it("covers the clip board only once it is deployed", () => {
    expect(sponsoredTargets(C)).toContain(C.clips);
    expect(sponsoredTargets({ ...C, clips: zeroAddress })).not.toContain(zeroAddress);
  });

  it("accepts the first operation, which deploys the account through a known factory", () => {
    const callData = kernelCallData(calls.faucet());
    expect(checkUserOperation(op(callData, { factory: KERNEL_META_FACTORY, factoryData: "0x1234" }), POLICY)).toEqual({ ok: true });
    expect(checkUserOperation(op(callData, { factory: KERNEL_FACTORY.toLowerCase() }), POLICY)).toEqual({ ok: true });
    expect(checkUserOperation(op(callData, { factory: null }), POLICY)).toEqual({ ok: true });
    expect(checkUserOperation(op(callData, { factory: zeroAddress }), POLICY)).toEqual({ ok: true });
  });

  it("refuses a call to a contract that is not ours", () => {
    const stranger = [{ to: addr(1234), data: "0x" as Hex }];
    expect(checkUserOperation(op(kernelCallData(stranger)), POLICY)).toEqual({ ok: false, reason: "That contract is not covered" });
  });

  it("refuses a batch where only one call is off the list", () => {
    const list = [...calls.tip(1n, USD, ""), { to: addr(1234), data: "0x" as Hex }];
    expect(checkUserOperation(op(kernelCallData(list)), POLICY)).toEqual({ ok: false, reason: "That contract is not covered" });
  });

  it("does not sponsor the yield strategy directly (it is reached through the vault)", () => {
    const direct = [{ to: C.yieldVault, data: "0x" as Hex }];
    expect(checkUserOperation(op(kernelCallData(direct)), POLICY).ok).toBe(false);
  });

  it("refuses native value, even to an allowed contract", () => {
    const list = [{ ...calls.faucet()[0]!, value: 1n }];
    expect(checkUserOperation(op(kernelCallData(list)), POLICY)).toEqual({ ok: false, reason: "Calls may not carry value" });
  });

  it("refuses a delegatecall into an allowed contract", () => {
    const callData = kernelCallData(calls.faucet(), "delegatecall");
    expect(checkUserOperation(op(callData), POLICY)).toEqual({ ok: false, reason: "Delegate calls are not allowed" });
  });

  it("refuses an unknown account factory", () => {
    const callData = kernelCallData(calls.faucet());
    expect(checkUserOperation(op(callData, { factory: addr(777) }), POLICY)).toEqual({ ok: false, reason: "Unknown account factory" });
  });

  it("refuses calldata that is not a Kernel execute (a module install, a token transfer, junk)", () => {
    const transfer = encodeFunctionData({ abi: usdAbi, functionName: "approve", args: [addr(5), 1n] });
    expect(checkUserOperation(op(transfer), POLICY)).toEqual({ ok: false, reason: "Unsupported account call" });
    expect(checkUserOperation(op("0xdeadbeef"), POLICY)).toEqual({ ok: false, reason: "Unsupported account call" });
  });

  it("caps the number of calls and the size of the operation", () => {
    const many = Array.from({ length: 7 }, () => calls.faucet()[0]!);
    expect(checkUserOperation(op(kernelCallData(many)), POLICY)).toEqual({ ok: false, reason: "Too many calls in one operation" });

    const big = [{ to: C.usd, data: `0x${"ab".repeat(20_000)}` as Hex }];
    expect(checkUserOperation(op(kernelCallData(big)), POLICY)).toEqual({ ok: false, reason: "Operation is too large" });
  });

  it("refuses malformed input without throwing", () => {
    for (const bad of [null, undefined, 5, "x", [], {}, { sender: addr(1) }, { sender: "nope", callData: "0x" }, { sender: addr(1), callData: 5 }]) {
      expect(checkUserOperation(bad, POLICY).ok).toBe(false);
    }
  });
});

describe("checkRequestParams", () => {
  const good = op(kernelCallData(calls.faucet()));

  it("checks the user operation, entry point and chain of a sponsorship request", () => {
    const rule = METHODS.pm_getPaymasterData!;
    expect(checkRequestParams(rule, [good, ENTRY_POINT_V07, "0x279f", {}], POLICY)).toEqual({ ok: true });
    expect(checkRequestParams(rule, [good, ENTRY_POINT_V07.toLowerCase(), "0x279f"], POLICY)).toEqual({ ok: true });
    expect(checkRequestParams(rule, [good, addr(5), "0x279f"], POLICY)).toEqual({ ok: false, reason: "Unsupported entry point" });
    expect(checkRequestParams(rule, [good, ENTRY_POINT_V07, "0x1"], POLICY)).toEqual({ ok: false, reason: "Wrong network" });
    expect(checkRequestParams(rule, [op(kernelCallData([{ to: addr(1234), data: "0x" as Hex }])), ENTRY_POINT_V07, "0x279f"], POLICY).ok).toBe(false);
  });

  it("only marks the commit-to-pay calls as sponsoring", () => {
    expect(METHODS.pm_getPaymasterData!.sponsors).toBe(true);
    expect(METHODS.pm_sponsorUserOperation!.sponsors).toBe(true);
    expect(METHODS.pm_getPaymasterStubData!.sponsors).toBeUndefined();
    expect(METHODS.eth_sendUserOperation!.sponsors).toBeUndefined();
  });

  it("does not forward anything that could move funds or read secrets", () => {
    for (const forbidden of ["eth_sendRawTransaction", "eth_sendTransaction", "eth_accounts", "personal_sign", "eth_getBalance", "debug_traceTransaction", "admin_nodeInfo"]) {
      expect(METHODS[forbidden]).toBeUndefined();
    }
  });
});
