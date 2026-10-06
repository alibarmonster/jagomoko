import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { applyNames, checkName, displayName, EMPTY_NAME_BOOK, nameKey, profileMessage, standIn, type NameBook } from "./name";

const ALICE = "0x7f3a9c0e2b1d4f6a8c0e2b1d4f6a8c0e2b1d4f6a";
const BOB = "0x1cAb000000000000000000000000000000bb1F00";

const book = (names: Record<string, string>): NameBook => ({
  nameOf: (address) => names[address.toLowerCase()],
  holderOf: (key) => Object.entries(names).find(([, n]) => nameKey(n) === key)?.[0],
});

describe("checkName", () => {
  it("cleans the name the way the screens show it", () => {
    const zeroWidth = String.fromCharCode(0x200b);
    expect(checkName(`  Ada${zeroWidth}  Lovelace `)).toEqual({ ok: true, name: "Ada Lovelace" });
  });

  it("refuses empty, reserved and stand-in names", () => {
    expect(checkName("   ").ok).toBe(false);
    for (const n of ["Anonymous", "a viewer", "MOKO", "jagomoko", "Knight-7f3a", "bard-00ff"]) expect(checkName(n).ok).toBe(false);
    expect(checkName("Knight of Ni").ok).toBe(true);
  });
});

describe("standIn", () => {
  it("is the role and the start of the account", () => {
    expect(standIn("Knight", ALICE)).toBe("Knight-7f3a");
    expect(standIn("Bard", BOB)).toBe("Bard-1cab");
  });
});

describe("profileMessage", () => {
  it("names everything the signature covers", () => {
    const text = profileMessage({ address: ALICE.toLowerCase(), name: "Ada", userId: "did:privy:abc", chainId: 10143, issuedAt: Date.UTC(2026, 9, 6, 12) });
    expect(text).toBe(
      [
        "jagomoko: set my character name",
        "Name: Ada",
        `Account: ${getAddress(ALICE)}`,
        "Signed in as: did:privy:abc",
        "Chain: 10143",
        "Issued: 2026-10-06T12:00:00.000Z",
      ].join("\n"),
    );
  });
});

describe("displayName", () => {
  const alice = { id: ALICE, name: "Knight-7f3a", role: "Knight" as const };
  const bob = { id: BOB, name: "Ada", role: "Bard" as const };

  it("shows the chosen name instead of the stand-in", () => {
    expect(displayName(alice, book({ [ALICE]: "Ada" }))).toBe("Ada");
  });

  it("falls back to what is on chain", () => {
    expect(displayName(alice, EMPTY_NAME_BOOK)).toBe("Knight-7f3a");
    expect(displayName(bob, EMPTY_NAME_BOOK)).toBe("Ada");
  });

  it("never lets an on-chain name pass for someone else's chosen name, or a reserved one", () => {
    // bob minted straight from the contract as "Ada", which alice chose
    expect(displayName(bob, book({ [ALICE]: "ada" }))).toBe("Bard-1cab");
    expect(displayName({ ...bob, name: "Anonymous" }, EMPTY_NAME_BOOK)).toBe("Bard-1cab");
    // the holder of the name keeps it
    expect(displayName({ id: ALICE, name: "Ada", role: "Knight" }, book({ [ALICE]: "Ada" }))).toBe("Ada");
  });

  it("renames a whole list", () => {
    expect(applyNames([alice, bob], book({ [ALICE]: "Ada" })).map((p) => p.name)).toEqual(["Ada", "Bard-1cab"]);
  });
});
