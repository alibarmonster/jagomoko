import { describe, expect, it } from "vitest";
import { encodeErrorResult } from "viem";
import { battleAbi, characterAbi, questAbi, vaultAbi } from "./abis";
import { FriendlyError, friendlyError, GENERIC_ERROR } from "./errors";

describe("friendlyError: contract reverts", () => {
  it("names a custom error found in a raw revert payload", () => {
    const data = encodeErrorResult({ abi: questAbi, errorName: "QuestClosed" });
    expect(friendlyError(new Error(`UserOperation reverted during simulation with reason: ${data}`))).toBe("Backing is closed for this quest.");
  });

  it("decodes errors from every contract", () => {
    const cases: [Parameters<typeof encodeErrorResult>[0], string][] = [
      [{ abi: characterAbi, errorName: "AlreadyHasCharacter" }, "You already have a character."],
      [{ abi: battleAbi, errorName: "OperatorCannotPlay" }, "Creators and moderators can't play in their own guild."],
      [{ abi: vaultAbi, errorName: "InvalidTarget" }, "That share is too high. The community can put up to 50% of the treasury to work."],
    ];
    for (const [input, expected] of cases) expect(friendlyError(new Error(`execution reverted: ${encodeErrorResult(input)}`))).toBe(expected);
  });

  it("finds the payload on a nested cause, like viem wraps errors", () => {
    const data = encodeErrorResult({ abi: questAbi, errorName: "ZeroAmount" });
    const inner = Object.assign(new Error("inner"), { details: `reverted ${data}` });
    const outer = Object.assign(new Error("The contract function reverted."), { cause: inner });
    expect(friendlyError(outer)).toBe("Enter an amount greater than zero.");
  });

  it("uses a decoded error name printed by the client", () => {
    expect(friendlyError(new Error("reverted with custom error 'NoCharacter()'"))).toBe("Create your character first.");
  });

  it("explains the practice-gold cooldown", () => {
    expect(friendlyError(new Error("execution reverted: MockUSD: cooldown"))).toBe(
      "Practice gold is on cooldown. You can claim more in about an hour.",
    );
  });

  it("does not mistake an address or hash for an error payload", () => {
    const hash = `0x${"ab".repeat(32)}`;
    expect(friendlyError(new Error(`tx ${hash} failed`))).toBe(GENERIC_ERROR);
  });
});

describe("friendlyError: account abstraction and network", () => {
  it("treats a wallet rejection as a cancel, not an error", () => {
    expect(friendlyError(new Error("User rejected the request."))).toBe("Cancelled.");
    expect(friendlyError(Object.assign(new Error("x"), { shortMessage: "User denied transaction signature" }))).toBe("Cancelled.");
  });

  it("hides paymaster and sponsorship problems behind one sentence", () => {
    const expected = "We couldn't cover the network fee just now. Try again in a moment.";
    expect(friendlyError(new Error("AA31 paymaster deposit too low"))).toBe(expected);
    expect(friendlyError(new Error("sponsorship policy limit reached"))).toBe(expected);
    expect(friendlyError(new Error("daily limit exceeded"))).toBe(expected);
  });

  it("covers rate limits, offline and bundler hiccups", () => {
    expect(friendlyError(new Error("HTTP 429 Too Many Requests"))).toBe("Slow down a little, then try again.");
    expect(friendlyError(new TypeError("Failed to fetch"))).toBe("Can't reach the network. Check your connection and try again.");
    expect(friendlyError(new Error("AA25 invalid account nonce"))).toBe("That didn't go through. Try again in a moment.");
  });

  it("never leaks jargon for an unknown revert", () => {
    const text = friendlyError(new Error("execution reverted"));
    expect(text).toBe("That didn't go through. Check the details and try again.");
    expect(text).not.toMatch(/revert|gas|nonce|0x/i);
  });

  it("falls back to a generic sentence, for anything", () => {
    expect(friendlyError(new Error("weird"))).toBe(GENERIC_ERROR);
    expect(friendlyError(undefined)).toBe(GENERIC_ERROR);
    expect(friendlyError(null)).toBe(GENERIC_ERROR);
    expect(friendlyError({})).toBe(GENERIC_ERROR);
    expect(friendlyError("boom")).toBe(GENERIC_ERROR);
  });
});

describe("friendlyError: sign-in and pre-written messages", () => {
  it("explains a wrong or expired email code", () => {
    const expected = "That code isn't right, or it expired. Check it and try again.";
    expect(friendlyError(new Error("Invalid email verification code"))).toBe(expected);
    expect(friendlyError(new Error("Code expired"))).toBe(expected);
    expect(friendlyError(new Error("Too many attempts, request a new code"))).toBe(expected);
  });

  it("reads the error code Privy's headless email login throws", () => {
    const privy = (privyErrorCode: string) => Object.assign(new Error("Request failed"), { privyErrorCode });
    expect(friendlyError(privy("invalid_credentials"))).toBe("That code isn't right, or it expired. Check it and try again.");
    expect(friendlyError(privy("too_many_requests"))).toBe("Too many tries. Wait a minute, then send a new code.");
    expect(friendlyError(privy("something_new"))).toBe(GENERIC_ERROR);
  });

  it("passes through a message that is already written for the viewer", () => {
    expect(friendlyError(new FriendlyError("Your account is still starting. Try again in a moment."))).toBe(
      "Your account is still starting. Try again in a moment.",
    );
  });
});
