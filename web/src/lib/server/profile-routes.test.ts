import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { EMPTY_NAME_BOOK, profileMessage } from "../profile-name";
import { handleProfileGet, handleProfilePost, type ProfileDeps } from "./profile-routes";
import type { ClaimResult, Profile, ProfileStore } from "./profiles";
import { RateLimiter } from "./ratelimit";

const ALICE = getAddress("0x7f3a9c0e2b1d4f6a8c0e2b1d4f6a8c0e2b1d4f6a");
const NOW = Date.UTC(2026, 9, 6, 12);
const CHAIN = 10143;

class MemoryStore implements ProfileStore {
  profiles: Profile[] = [];
  async book() {
    return EMPTY_NAME_BOOK;
  }
  async byUser(userId: string) {
    return this.profiles.find((p) => p.userId === userId) ?? null;
  }
  async claim(p: Profile): Promise<ClaimResult> {
    if (this.profiles.some((x) => x.name.toLowerCase() === p.name.toLowerCase() && x.address !== p.address)) return { ok: false, reason: "taken" };
    this.profiles = [...this.profiles.filter((x) => x.address !== p.address), p];
    return { ok: true };
  }
}

/** Tokens are "token-<user>"; a signature is valid when it is "0x" + hex of the exact message it signs. */
function setup(over: Partial<ProfileDeps> = {}) {
  const store = new MemoryStore();
  const deps: ProfileDeps = {
    verifyToken: async (token) => {
      if (!token.startsWith("token-")) throw new Error("bad token");
      return { userId: token.slice(6) };
    },
    verifySignature: async (_address, message, signature) => signature === toHex(message),
    isGuildHandle: async (key) => key === "neon",
    store,
    writes: new RateLimiter(10, 60_000, () => NOW),
    reads: new RateLimiter(10, 60_000, () => NOW),
    chainId: CHAIN,
    now: () => NOW,
    ...over,
  };
  return { deps, store };
}

const toHex = (text: string) => `0x${Buffer.from(text, "utf8").toString("hex")}`;

function post(body: unknown, token: string | null = "token-u1") {
  return new Request("http://localhost/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** A request alice really signed. */
function signed(name: string, opts: { userId?: string; issuedAt?: number; address?: string } = {}) {
  const issuedAt = opts.issuedAt ?? NOW - 1_000;
  const address = opts.address ?? ALICE;
  const message = profileMessage({ address, name, userId: opts.userId ?? "u1", chainId: CHAIN, issuedAt });
  return { address, name, issuedAt, signature: toHex(message) };
}

const get = (token: string | null = "token-u1") =>
  new Request("http://localhost/api/profile", { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("POST /api/profile", () => {
  it("saves a name signed by the account, and GET gives it back to its owner only", async () => {
    const { deps } = setup();
    const res = await handleProfilePost(post(signed("Ada")), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ address: ALICE, name: "Ada" });

    expect(await (await handleProfileGet(get(), deps)).json()).toEqual({ address: ALICE, name: "Ada" });
    expect((await handleProfileGet(get("token-u2"), deps)).status).toBe(404);
    expect((await handleProfileGet(get(null), deps)).status).toBe(401);
  });

  it("needs a valid sign-in", async () => {
    const { deps } = setup();
    expect((await handleProfilePost(post(signed("Ada"), null), deps)).status).toBe(401);
    expect((await handleProfilePost(post(signed("Ada"), "forged"), deps)).status).toBe(401);
  });

  it("refuses a signature made for another name, user or account", async () => {
    const { deps } = setup();
    const forOther = signed("Ada", { userId: "u2" }); // someone else's signed request, replayed by u1
    expect((await handleProfilePost(post(forOther), deps)).status).toBe(401);
    const swapped = { ...signed("Ada"), name: "Grace" };
    expect((await handleProfilePost(post(swapped), deps)).status).toBe(401);
  });

  it("refuses old or future-dated requests", async () => {
    const { deps } = setup();
    expect((await handleProfilePost(post(signed("Ada", { issuedAt: NOW - 6 * 60_000 })), deps)).status).toBe(400);
    expect((await handleProfilePost(post(signed("Ada", { issuedAt: NOW + 2 * 60_000 })), deps)).status).toBe(400);
  });

  it("refuses reserved names, guild handles and taken names", async () => {
    const { deps, store } = setup();
    expect((await handleProfilePost(post(signed("Anonymous")), deps)).status).toBe(400);
    expect((await handleProfilePost(post(signed("Neon")), deps)).status).toBe(409);
    store.profiles.push({ address: getAddress("0x1cab000000000000000000000000000000bb1f00"), name: "Ada", userId: "u2", updatedAt: 1 });
    const taken = await handleProfilePost(post(signed("ada")), deps);
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: "That name is taken. Pick another one." });
  });

  it("refuses malformed bodies", async () => {
    const { deps } = setup();
    expect((await handleProfilePost(post("{oops"), deps)).status).toBe(400);
    expect((await handleProfilePost(post([1, 2]), deps)).status).toBe(400);
    expect((await handleProfilePost(post({ ...signed("Ada"), address: "0x123" }), deps)).status).toBe(400);
    expect((await handleProfilePost(post({ ...signed("Ada"), signature: "not hex" }), deps)).status).toBe(400);
    expect((await handleProfilePost(post({ ...signed("Ada"), issuedAt: "soon" }), deps)).status).toBe(400);
  });

  it("says so when the chain cannot be asked", async () => {
    const { deps } = setup({ verifySignature: async () => Promise.reject(new Error("rpc down")) });
    expect((await handleProfilePost(post(signed("Ada")), deps)).status).toBe(503);
  });

  it("limits name changes per user", async () => {
    const { deps } = setup({ writes: new RateLimiter(1, 60_000, () => NOW) });
    expect((await handleProfilePost(post(signed("Ada")), deps)).status).toBe(200);
    expect((await handleProfilePost(post(signed("Grace")), deps)).status).toBe(429);
  });
});
