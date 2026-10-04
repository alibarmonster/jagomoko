import { describe, expect, it } from "vitest";
import { decodeFunctionData, getAddress, type Address } from "viem";
import { battleAbi, characterAbi, juryAbi, questAbi, treasuryAbi, usdAbi, vaultAbi } from "./abis";
import { createCalls, toId, type Call } from "./calls";
import { parseContracts, type Contracts } from "./config";
import { usd } from "../money";

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
  };

  it("maps deployment names to fields", () => {
    expect(parseContracts(good)).toEqual(C);
  });

  it("rejects a missing or malformed address", () => {
    expect(() => parseContracts({ ...good, Jury: "0x123" })).toThrow(/Jury/);
    const { SplitVault: _gone, ...rest } = good;
    expect(() => parseContracts(rest)).toThrow(/SplitVault/);
  });
});
