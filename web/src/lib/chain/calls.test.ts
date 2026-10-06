import { describe, expect, it } from "vitest";
import { decodeFunctionData, getAddress, zeroAddress, type Address } from "viem";
import { battleAbi, characterAbi, clipsAbi, juryAbi, poolAbi, questAbi, registryAbi, treasuryAbi, usdAbi, vaultAbi } from "./abis";
import { createCalls, toId, type Call } from "./calls";
import { parseContracts, type Contracts } from "./config";
import { usd } from "../utils/money";

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
  pool: addr(11),
  lstLeg: addr(12),
  lst: addr(13),
  swap: addr(14),
  tipReceiver: addr(15),
};
const calls = createCalls(C);
const USD = 1_000_000n;

const decoded = <T extends readonly unknown[]>(call: Call, abi: T) => decodeFunctionData({ abi: abi as never, data: call.data }) as {
  functionName: string;
  args: readonly unknown[];
};

describe("money actions batch an exact-amount approve with the action", () => {
  it("tip = approve(vault, amount) + deposit(creator, amount, memo)", () => {
    const [approve, deposit] = calls.tip(1n, usd(5), "gg");
    expect(approve!.to).toBe(C.usd);
    expect(decoded(approve!, usdAbi)).toEqual({ functionName: "approve", args: [C.vault, 5n * USD] });
    expect(deposit!.to).toBe(C.vault);
    expect(decoded(deposit!, vaultAbi)).toEqual({ functionName: "deposit", args: [1n, 5n * USD, "gg"] });
  });

  it("backing a quest approves the escrow, not the vault", () => {
    const [approve, back] = calls.backQuest(7n, usd(10));
    expect(decoded(approve!, usdAbi).args).toEqual([C.quests, 10n * USD]);
    expect(back!.to).toBe(C.quests);
    expect(decoded(back!, questAbi)).toEqual({ functionName: "back", args: [7n, 10n * USD] });
  });

  it("joining a battle with money approves and stakes the same amount", () => {
    const list = calls.joinBattle(3n, 1, usd(2.5), false);
    expect(list).toHaveLength(2);
    expect(decoded(list[0]!, usdAbi).args).toEqual([C.battles, 2_500_000n]);
    expect(decoded(list[1]!, battleAbi)).toEqual({ functionName: "join", args: [3n, 1, 2_500_000n] });
  });

  it("points mode is one free call: no approve, and the amount is forced to zero", () => {
    const list = calls.joinBattle(3n, 0, usd(99), true);
    expect(list).toHaveLength(1);
    expect(list[0]!.to).toBe(C.battles);
    expect(decoded(list[0]!, battleAbi)).toEqual({ functionName: "join", args: [3n, 0, 0n] });
  });

  it("no call ever carries native value", () => {
    const all = [
      ...calls.tip(1n, 1n, ""),
      ...calls.backQuest(1n, 1n),
      ...calls.joinBattle(1n, 0, 1n, false),
      ...calls.faucet(),
      ...calls.mintCharacter("Seer", "x"),
    ];
    for (const c of all) expect(c.value ?? 0n).toBe(0n);
  });
});

describe("character, claims and disputes", () => {
  it("maps each role to its contract enum index", () => {
    const index = (role: "Knight" | "Seer" | "Judge" | "Bard") => decoded(calls.mintCharacter(role, "Ada")[0]!, characterAbi).args[0];
    expect([index("Knight"), index("Seer"), index("Judge"), index("Bard")]).toEqual([0, 1, 2, 3]);
  });

  it("mints on the character contract", () => {
    const [mint] = calls.mintCharacter("Judge", "Ada");
    expect(mint!.to).toBe(C.character);
    expect(decoded(mint!, characterAbi)).toEqual({ functionName: "mint", args: [2, "Ada"] });
  });

  it("claims go to the contract that holds the money", () => {
    expect(calls.claimQuest(4n)[0]!.to).toBe(C.quests);
    expect(decoded(calls.claimQuest(4n)[0]!, questAbi)).toEqual({ functionName: "claim", args: [4n] });
    expect(calls.claimBattle(4n)[0]!.to).toBe(C.battles);
    expect(decoded(calls.claimBattle(4n)[0]!, battleAbi)).toEqual({ functionName: "claim", args: [4n] });
  });

  it("disputes a quest", () => {
    expect(decoded(calls.disputeQuest(2n)[0]!, questAbi)).toEqual({ functionName: "dispute", args: [2n] });
  });

  it("the faucet takes no arguments", () => {
    expect(decoded(calls.faucet()[0]!, usdAbi)).toEqual({ functionName: "faucet", args: undefined });
  });
});

describe("jury and treasury", () => {
  it("encodes jury votes as the Verdict enum (Yes = 1, No = 2)", () => {
    expect(decoded(calls.voteJury(5n, "yes")[0]!, juryAbi).args).toEqual([5n, 1]);
    expect(decoded(calls.voteJury(5n, "no")[0]!, juryAbi).args).toEqual([5n, 2]);
  });

  it("closes a jury case", () => {
    const [call] = calls.resolveJuryCase(9n);
    expect(call!.to).toBe(C.jury);
    expect(decoded(call!, juryAbi)).toEqual({ functionName: "resolve", args: [9n] });
  });

  it("enlists and leaves", () => {
    expect(decoded(calls.enlist()[0]!, juryAbi).functionName).toBe("enlist");
    expect(decoded(calls.leaveJury()[0]!, juryAbi).functionName).toBe("leave");
  });

  it("votes, proposes a spend, and proposes an allocation on the treasury", () => {
    expect(decoded(calls.voteProposal(3n, true)[0]!, treasuryAbi)).toEqual({ functionName: "vote", args: [3n, true] });
    expect(decoded(calls.proposeSpend(1n, addr(42), usd(20), "Clip bounty")[0]!, treasuryAbi)).toEqual({
      functionName: "propose",
      args: [1n, addr(42), 20n * USD, "Clip bounty"],
    });
    const alloc = calls.proposeAllocation(1n, 2_500, "Put a quarter to work")[0]!;
    expect(alloc.to).toBe(C.treasury);
    expect(decoded(alloc, treasuryAbi)).toEqual({ functionName: "proposeAllocation", args: [1n, 2_500, "Put a quarter to work"] });
  });

  it("rebalancing goes to the vault", () => {
    const [r] = calls.rebalanceTreasury(1n);
    expect(r!.to).toBe(C.vault);
    expect(decoded(r!, vaultAbi)).toEqual({ functionName: "rebalance", args: [1n] });
  });
});

describe("creator (streamer) calls", () => {
  const split = { creatorBps: 9_800, treasuryBps: 100, communityBps: 100 };

  it("opens a realm on the registry with the handle and split", () => {
    const [call] = calls.registerCreator("karambol", split);
    expect(call!.to).toBe(C.registry);
    expect(decoded(call!, registryAbi)).toEqual({ functionName: "register", args: ["karambol", split] });
  });

  it("queues and applies split changes, and manages moderators", () => {
    expect(decoded(calls.queueSplit(2n, split)[0]!, registryAbi)).toEqual({ functionName: "queueSplit", args: [2n, split] });
    expect(decoded(calls.applySplit(2n)[0]!, registryAbi)).toEqual({ functionName: "applySplit", args: [2n] });
    expect(decoded(calls.setModerator(2n, addr(77), true)[0]!, registryAbi)).toEqual({ functionName: "setModerator", args: [2n, addr(77), true] });
  });

  it("creates quests and battles with unix deadlines", () => {
    const quest = calls.createQuest(1n, "Beat the boss", 1_800_000_000n)[0]!;
    expect(quest.to).toBe(C.quests);
    expect(decoded(quest, questAbi)).toEqual({ functionName: "createQuest", args: [1n, "Beat the boss", 1_800_000_000n] });

    const battle = calls.createBattle(1n, "Win this match?", "Win", "Lose", 1_800_000_300n, false)[0]!;
    expect(battle.to).toBe(C.battles);
    expect(decoded(battle, battleAbi)).toEqual({
      functionName: "createBattle",
      args: [1n, "Win this match?", "Win", "Lose", 1_800_000_300n, false],
    });
  });

  it("reports and finalizes results on the contract that holds the market", () => {
    const q = calls.proposeQuestOutcome(4n, true, "https://youtu.be/x?t=10")[0]!;
    expect(q.to).toBe(C.quests);
    expect(decoded(q, questAbi)).toEqual({ functionName: "proposeOutcome", args: [4n, true, "https://youtu.be/x?t=10"] });

    const b = calls.proposeBattleOutcome(4n, false, "https://youtu.be/y")[0]!;
    expect(b.to).toBe(C.battles);
    expect(decoded(b, battleAbi)).toEqual({ functionName: "proposeOutcome", args: [4n, false, "https://youtu.be/y"] });

    expect(calls.finalizeQuest(4n)[0]!.to).toBe(C.quests);
    expect(decoded(calls.finalizeQuest(4n)[0]!, questAbi)).toEqual({ functionName: "finalize", args: [4n] });
    expect(calls.finalizeBattle(4n)[0]!.to).toBe(C.battles);
    expect(decoded(calls.finalizeBattle(4n)[0]!, battleAbi)).toEqual({ functionName: "finalize", args: [4n] });
  });

  it("withdraws earnings from the vault to the given address", () => {
    const [w] = calls.withdrawEarnings(1n, addr(55));
    expect(w!.to).toBe(C.vault);
    expect(decoded(w!, vaultAbi)).toEqual({ functionName: "withdrawCreator", args: [1n, addr(55)] });
  });
});

describe("toId", () => {
  it("accepts plain integers only", () => {
    expect(toId("12")).toBe(12n);
    expect(toId("0")).toBe(0n);
    for (const bad of ["", "-1", "1.5", "0x10", "12a", " 1", "1 ", "9".repeat(21)]) expect(toId(bad)).toBeNull();
  });
});

describe("parseContracts", () => {
  const good = {
    MockUSD: addr(1),
    MockYieldVault: addr(2),
    CreatorRegistry: addr(3),
    Character: addr(4),
    SplitVault: addr(5),
    Jury: addr(6),
    QuestEscrow: addr(7),
    PredictionBattle: addr(8),
    CommunityTreasury: addr(9),
    ClipBoard: addr(10),
    CommunityPoolVault: addr(11),
    LstStrategy: addr(12),
    MockLST: addr(13),
    MokoSwap: addr(14),
    TipReceiver: addr(15),
  };

  it("maps deployment names to fields", () => {
    expect(parseContracts(good)).toEqual(C);
  });

  it("rejects a missing or malformed address", () => {
    expect(() => parseContracts({ ...good, Jury: "0x123" })).toThrow(/Jury/);
    const { SplitVault: _gone, ...rest } = good;
    expect(() => parseContracts(rest)).toThrow(/SplitVault/);
  });

  it("loads a deployment from before ClipBoard, with clips switched off", () => {
    const { ClipBoard: _later, ...before } = good;
    expect(parseContracts(before).clips).toBe(zeroAddress);
    expect(() => parseContracts({ ...good, ClipBoard: "0x123" })).toThrow(/ClipBoard/);
  });

  it("loads a deployment from before v2, with the pool and cross-chain tips switched off", () => {
    const { CommunityPoolVault: _a, LstStrategy: _b, MockLST: _c, MokoSwap: _d, TipReceiver: _e, ...v1 } = good;
    const parsed = parseContracts(v1);
    for (const field of ["pool", "lstLeg", "lst", "swap", "tipReceiver"] as const) expect(parsed[field]).toBe(zeroAddress);
    expect(() => parseContracts({ ...good, TipReceiver: "0x123" })).toThrow(/TipReceiver/);
  });
});

describe("pool calls", () => {
  it("rebalancing the pool is one call anyone can make", () => {
    const [r] = calls.rebalancePool();
    expect(r!.to).toBe(C.pool);
    expect(decoded(r!, poolAbi)).toEqual({ functionName: "rebalanceMix", args: undefined });
  });

  it("the curator sets the mix and applies it in one batch", () => {
    const [set, apply] = calls.setPoolMix(3_000);
    expect(decoded(set!, poolAbi)).toEqual({ functionName: "setMix", args: [3_000] });
    expect(decoded(apply!, poolAbi).functionName).toBe("rebalanceMix");
    expect([set!.to, apply!.to]).toEqual([C.pool, C.pool]);
  });
});

describe("clip bounty calls", () => {
  it("escrows a reward in the same batch as the bounty, and skips the approve for zero", () => {
    const [approve, create] = calls.createBounty(1n, "Best clip", usd(25), 1_800_000_000n, 1_800_003_600n);
    expect(decoded(approve!, usdAbi)).toEqual({ functionName: "approve", args: [C.clips, 25n * USD] });
    expect(create!.to).toBe(C.clips);
    expect(decoded(create!, clipsAbi)).toEqual({ functionName: "createBounty", args: [1n, "Best clip", 25n * USD, 1_800_000_000n, 1_800_003_600n] });
    expect(calls.createBounty(1n, "Community funded", 0n, 1n, 2n)).toHaveLength(1);
  });

  it("asks the community through a treasury payout to the clip board", () => {
    const [ask] = calls.askCommunity(1n, usd(20), "Clip bounty pool");
    expect(ask!.to).toBe(C.treasury);
    expect(decoded(ask!, treasuryAbi)).toEqual({ functionName: "propose", args: [1n, C.clips, 20n * USD, "Clip bounty pool"] });
  });

  it("sends every other bounty action to the clip board", () => {
    const cases: [ReturnType<typeof calls.submitClip>, string, unknown[]][] = [
      [calls.fundBounty(2n, 7n), "fundFromProposal", [2n, 7n]],
      [calls.returnPayout(7n), "returnProposalFunds", [7n]],
      [calls.submitClip(2n, "https://youtu.be/dQw4w9WgXcQ"), "submitClip", [2n, "https://youtu.be/dQw4w9WgXcQ"]],
      [calls.voteClip(3n), "vote", [3n]],
      [calls.hideClip(3n, true), "hide", [3n, true]],
      [calls.finalizeBounty(2n), "finalize", [2n]],
    ];
    for (const [[call], functionName, args] of cases) {
      expect(call!.to).toBe(C.clips);
      expect(decoded(call!, clipsAbi)).toEqual({ functionName, args });
    }
  });
});
