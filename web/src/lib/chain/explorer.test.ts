import { describe, expect, it } from "vitest";
import { EXPLORER, explorerAddress, explorerTx } from "./config";
import { viewTx } from "./explorer";

describe("explorer links", () => {
  it("point at Monadscan, where the contracts are verified", () => {
    expect(EXPLORER).toEqual({ name: "Monadscan", url: "https://testnet.monadscan.com" });
    expect(explorerTx("0xabc")).toBe("https://testnet.monadscan.com/tx/0xabc");
  });

  it("can open an address on its token transfers, where sponsored activity shows up", () => {
    expect(explorerAddress("0x1cAb")).toBe("https://testnet.monadscan.com/address/0x1cAb");
    expect(explorerAddress("0x1cAb", { tokens: true })).toBe("https://testnet.monadscan.com/address/0x1cAb#tokentxns");
  });

  it("only offer a toast link when there was a transaction", () => {
    expect(viewTx(undefined)).toBeUndefined();
    expect(viewTx("0xabc")).toEqual({ label: "View on Monadscan", href: "https://testnet.monadscan.com/tx/0xabc" });
  });
});
