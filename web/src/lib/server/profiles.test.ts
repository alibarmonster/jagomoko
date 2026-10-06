import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileProfileStore } from "./profiles";

const ALICE = "0x7f3a9c0e2b1d4f6a8c0e2b1d4f6a8c0e2b1d4f6a";
const BOB = "0x1cab000000000000000000000000000000bb1f00";

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jagomoko-profiles-"));
  path = join(dir, "nested", "profiles.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("FileProfileStore", () => {
  it("starts empty and saves a name to disk", async () => {
    const store = new FileProfileStore(path);
    expect(await store.byUser("u1")).toBeNull();
    expect(await store.claim({ address: ALICE, name: "Ada", userId: "u1", updatedAt: 1 })).toEqual({ ok: true });

    const book = await store.book();
    expect(book.nameOf(ALICE)).toBe("Ada");
    expect(book.nameOf(ALICE.toUpperCase().replace("0X", "0x"))).toBe("Ada");
    expect(book.holderOf("ada")?.toLowerCase()).toBe(ALICE);
    expect(await store.byUser("u1")).toMatchObject({ name: "Ada" });

    // a fresh process reads the same file
    const again = new FileProfileStore(path);
    expect((await again.book()).nameOf(ALICE)).toBe("Ada");
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ version: 1, profiles: [{ name: "Ada", userId: "u1" }] });
  });

  it("gives a name to one account only, whatever the case", async () => {
    const store = new FileProfileStore(path);
    await store.claim({ address: ALICE, name: "Ada", userId: "u1", updatedAt: 1 });
    expect(await store.claim({ address: BOB, name: "ADA", userId: "u2", updatedAt: 2 })).toEqual({ ok: false, reason: "taken" });
    // alice keeps hers, and may restyle it
    expect(await store.claim({ address: ALICE, name: "ada", userId: "u1", updatedAt: 3 })).toEqual({ ok: true });
  });

  it("frees the old name on a rename", async () => {
    const store = new FileProfileStore(path);
    await store.claim({ address: ALICE, name: "Ada", userId: "u1", updatedAt: 1 });
    await store.claim({ address: ALICE, name: "Grace", userId: "u1", updatedAt: 2 });
    expect(await store.claim({ address: BOB, name: "Ada", userId: "u2", updatedAt: 3 })).toEqual({ ok: true });
    const book = await store.book();
    expect(book.nameOf(ALICE)).toBe("Grace");
    expect(book.holderOf("ada")?.toLowerCase()).toBe(BOB);
  });

  it("refuses a change that is not newer than the saved one", async () => {
    const store = new FileProfileStore(path);
    await store.claim({ address: ALICE, name: "Ada", userId: "u1", updatedAt: 5 });
    expect(await store.claim({ address: ALICE, name: "Old", userId: "u1", updatedAt: 5 })).toEqual({ ok: false, reason: "stale" });
    expect(await store.claim({ address: ALICE, name: "Older", userId: "u1", updatedAt: 4 })).toEqual({ ok: false, reason: "stale" });
  });

  it("lets only one of two racing claims win", async () => {
    const store = new FileProfileStore(path);
    const results = await Promise.all([
      store.claim({ address: ALICE, name: "Ada", userId: "u1", updatedAt: 1 }),
      store.claim({ address: BOB, name: "ada", userId: "u2", updatedAt: 1 }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("refuses to read (or overwrite) a damaged file", async () => {
    const file = join(dir, "profiles.json");
    writeFileSync(file, "{ not json");
    const store = new FileProfileStore(file);
    await expect(store.book()).rejects.toThrow();
    await expect(store.claim({ address: ALICE, name: "Ada", userId: "u1", updatedAt: 1 })).rejects.toThrow();
    expect(readFileSync(file, "utf8")).toBe("{ not json");
  });
});
