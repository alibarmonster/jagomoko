import { describe, expect, it } from "vitest";
import { getAddress, type Address, type Hex } from "viem";
import { encode7579Calls } from "permissionless/utils";
import { createCalls, type Call } from "../chain/calls";
import { ENTRY_POINT_V07, KERNEL_META_FACTORY, sponsoredTargets, type Contracts } from "../chain/config";
import type { Policy } from "../aa/policy";
import { handleAaRequest, type AaDeps } from "./aa-proxy";
import { READ_METHODS, handleRpcRequest, type RpcDeps } from "./rpc-proxy";
import { RateLimiter } from "./ratelimit";
import type { RpcRequest } from "./jsonrpc";

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
const POLICY: Policy = {
  entryPoint: ENTRY_POINT_V07,
  chainId: 10143,
  factories: [KERNEL_META_FACTORY],
  targets: sponsoredTargets(C),
  maxCalls: 6,
  maxCallDataBytes: 16_384,
};

const kernel = (list: Call[]): Hex =>
  encode7579Calls({ mode: { type: list.length > 1 ? "batchcall" : "call", revertOnError: false, selector: "0x", context: "0x" }, callData: list });
const userOp = (list: Call[] = calls.tip(1n, 1_000_000n, "")) => ({ sender: addr(99), nonce: "0x0", callData: kernel(list) });
const offList = userOp([{ to: addr(1234), data: "0x" as Hex }]);

function aa(overrides: Partial<AaDeps> = {}) {
  const forwarded: RpcRequest[] = [];
  const deps: AaDeps = {
    verifyToken: async (token) => {
      if (token === "alice") return { userId: "user-alice" };
      if (token === "bob") return { userId: "user-bob" };
      throw new Error("invalid token");
    },
    forward: async (rpc) => {
      forwarded.push(rpc);
      return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: "ok" }) };
    },
    policy: POLICY,
    requests: new RateLimiter(1_000, 60_000),
    sponsored: new RateLimiter(2, 3_600_000),
    sponsorshipPolicyId: "sp_jagomoko",
    ...overrides,
  };
  return { deps, forwarded };
}

const post = (body: unknown, token: string | null = "alice", extra: Record<string, string> = {}) =>
  new Request("http://localhost/api/aa", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const rpc = (method: string, params: unknown[] = [], id: number | string = 1) => ({ jsonrpc: "2.0", id, method, params });
const sponsor = (op = userOp(), context: unknown = {}) => rpc("pm_getPaymasterData", [op, ENTRY_POINT_V07, "0x279f", context]);
const errorOf = async (res: Response) => ((await res.json()) as { error?: { code: number; message: string } }).error;

describe("/api/aa: who may call", () => {
  it("refuses anonymous callers and bad tokens, and forwards nothing", async () => {
    const { deps, forwarded } = aa();
    expect((await handleAaRequest(post(sponsor(), null), deps)).status).toBe(401);
    expect((await handleAaRequest(post(sponsor(), "nope"), deps)).status).toBe(401);
    expect((await handleAaRequest(post(sponsor(), ""), deps)).status).toBe(401);
    expect(forwarded).toHaveLength(0);
  });

  it("never echoes the token or details of why verification failed", async () => {
    const { deps } = aa();
    const res = await handleAaRequest(post(sponsor(), "secret-token-value"), deps);
    const text = await res.text();
    expect(text).not.toContain("secret-token-value");
    expect(text).not.toContain("invalid token");
  });
});

describe("/api/aa: what may be forwarded", () => {
  it("forwards a plain jagomoko operation and returns the upstream answer", async () => {
    const { deps, forwarded } = aa();
    const res = await handleAaRequest(post(sponsor()), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 1, result: "ok" });
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]!.method).toBe("pm_getPaymasterData");
  });

  it("refuses methods that are not on the allowlist, including prototype keys", async () => {
    const { deps, forwarded } = aa();
    for (const method of ["eth_sendRawTransaction", "eth_sendTransaction", "personal_sign", "debug_traceCall", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const res = await handleAaRequest(post(rpc(method)), deps);
      expect(res.status, method).toBe(403);
    }
    expect(forwarded).toHaveLength(0);
  });

  it("refuses an operation that calls a contract outside jagomoko", async () => {
    const { deps, forwarded } = aa();
    const res = await handleAaRequest(post(sponsor(offList)), deps);
    expect(res.status).toBe(403);
    expect((await errorOf(res))?.message).toMatch(/not covered/i);
    expect(forwarded).toHaveLength(0);
  });

  it("also guards sending, not only sponsoring", async () => {
    const { deps, forwarded } = aa();
    const res = await handleAaRequest(post(rpc("eth_sendUserOperation", [offList, ENTRY_POINT_V07])), deps);
    expect(res.status).toBe(403);
    expect(forwarded).toHaveLength(0);
  });

  it("refuses a different entry point and a different network", async () => {
    const { deps } = aa();
    expect((await handleAaRequest(post(rpc("pm_getPaymasterData", [userOp(), addr(5), "0x279f", {}])), deps)).status).toBe(403);
    expect((await handleAaRequest(post(rpc("pm_getPaymasterData", [userOp(), ENTRY_POINT_V07, "0x1", {}])), deps)).status).toBe(403);
  });

  it("lets read-only bundler calls through without an operation", async () => {
    const { deps, forwarded } = aa();
    for (const m of ["eth_chainId", "eth_supportedEntryPoints", "pimlico_getUserOperationGasPrice"]) {
      expect((await handleAaRequest(post(rpc(m)), deps)).status).toBe(200);
    }
    expect((await handleAaRequest(post(rpc("eth_getUserOperationReceipt", ["0xabc"])), deps)).status).toBe(200);
    expect(forwarded).toHaveLength(4);
  });
});

describe("/api/aa: the sponsorship policy is pinned on the server", () => {
  it("overwrites whatever policy id the browser asked for", async () => {
    const { deps, forwarded } = aa();
    await handleAaRequest(post(sponsor(userOp(), { sponsorshipPolicyId: "sp_free_for_all", other: 1 })), deps);
    expect(forwarded[0]!.params![3]).toEqual({ sponsorshipPolicyId: "sp_jagomoko", other: 1 });
  });

  it("adds the policy id when the browser sent no context, and for the stub call too", async () => {
    const { deps, forwarded } = aa();
    await handleAaRequest(post(rpc("pm_getPaymasterStubData", [userOp(), ENTRY_POINT_V07, "0x279f"])), deps);
    expect(forwarded[0]!.params![3]).toEqual({ sponsorshipPolicyId: "sp_jagomoko" });
  });

  it("ignores a context that is not an object", async () => {
    const { deps, forwarded } = aa();
    await handleAaRequest(post(sponsor(userOp(), ["x"])), deps);
    expect(forwarded[0]!.params![3]).toEqual({ sponsorshipPolicyId: "sp_jagomoko" });
  });

  it("leaves the context alone when no policy id is configured", async () => {
    const { deps, forwarded } = aa({ sponsorshipPolicyId: undefined });
    await handleAaRequest(post(sponsor(userOp(), { a: 1 })), deps);
    expect(forwarded[0]!.params![3]).toEqual({ a: 1 });
  });

  it("forwards a re-serialised request, never the raw body", async () => {
    const { deps, forwarded } = aa();
    await handleAaRequest(post({ ...sponsor(), evil: true, extra: { x: 1 } }), deps);
    expect(Object.keys(forwarded[0]!).sort()).toEqual(["id", "jsonrpc", "method", "params"]);
  });
});

describe("/api/aa: limits", () => {
  it("spends the sponsored budget only on calls that commit to paying, per viewer", async () => {
    const { deps } = aa();
    expect((await handleAaRequest(post(sponsor()), deps)).status).toBe(200);
    expect((await handleAaRequest(post(sponsor()), deps)).status).toBe(200);

    const third = await handleAaRequest(post(sponsor()), deps);
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toMatch(/^\d+$/);

    // another viewer is unaffected, and the stub call (no commitment) is free
    expect((await handleAaRequest(post(sponsor(), "bob"), deps)).status).toBe(200);
    for (let i = 0; i < 5; i++) {
      expect((await handleAaRequest(post(rpc("pm_getPaymasterStubData", [userOp(), ENTRY_POINT_V07, "0x279f"])), deps)).status).toBe(200);
    }
  });

  it("does not burn the sponsored budget on refused operations", async () => {
    const { deps } = aa();
    for (let i = 0; i < 5; i++) await handleAaRequest(post(sponsor(offList)), deps);
    expect((await handleAaRequest(post(sponsor()), deps)).status).toBe(200);
    expect((await handleAaRequest(post(sponsor()), deps)).status).toBe(200);
  });

  it("rate-limits every call per viewer", async () => {
    const { deps } = aa({ requests: new RateLimiter(3, 60_000) });
    for (let i = 0; i < 3; i++) expect((await handleAaRequest(post(rpc("eth_chainId")), deps)).status).toBe(200);
    expect((await handleAaRequest(post(rpc("eth_chainId")), deps)).status).toBe(429);
    expect((await handleAaRequest(post(rpc("eth_chainId"), "bob"), deps)).status).toBe(200);
  });

  it("rejects batches, junk and oversized bodies", async () => {
    const { deps, forwarded } = aa();
    expect((await handleAaRequest(post([sponsor(), sponsor()]), deps)).status).toBe(400);
    expect((await handleAaRequest(post("{not json"), deps)).status).toBe(400);
    expect((await handleAaRequest(post({ jsonrpc: "1.0", id: 1, method: "eth_chainId" }), deps)).status).toBe(400);
    expect((await handleAaRequest(post({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: "x" }), deps)).status).toBe(400);
    expect((await handleAaRequest(post(JSON.stringify({ ...rpc("eth_chainId"), pad: "x".repeat(70_000) })), deps)).status).toBe(413);
    expect(forwarded).toHaveLength(0);
  });

  it("answers 502 without leaking upstream details when the bundler is down", async () => {
    const { deps } = aa({
      forward: async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:443 apikey=SECRET");
      },
    });
    const res = await handleAaRequest(post(rpc("eth_chainId")), deps);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toMatch(/ECONNREFUSED|SECRET|10\.0\.0\.5/);
  });
});

describe("/api/rpc: public reads only", () => {
  function reads(overrides: Partial<RpcDeps> = {}) {
    const forwarded: RpcRequest[] = [];
    const deps: RpcDeps = {
      forward: async (r) => {
        forwarded.push(r);
        return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: r.id, result: "0x1" }) };
      },
      limiter: new RateLimiter(1_000, 60_000),
      ...overrides,
    };
    return { deps, forwarded };
  }
  const get = (body: unknown, ip = "1.2.3.4") =>
    new Request("http://localhost/api/rpc", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });

  it("forwards reads without a sign-in", async () => {
    const { deps, forwarded } = reads();
    const res = await handleRpcRequest(get(rpc("eth_call", [{ to: addr(1), data: "0x" }, "latest"])), deps);
    expect(res.status).toBe(200);
    expect(forwarded).toHaveLength(1);
  });

  it("can never send a transaction", async () => {
    const { deps, forwarded } = reads();
    for (const m of ["eth_sendRawTransaction", "eth_sendTransaction", "eth_sign", "debug_traceTransaction", "txpool_content", "constructor"]) {
      expect((await handleRpcRequest(get(rpc(m)), deps)).status, m).toBe(403);
    }
    expect(forwarded).toHaveLength(0);
    for (const m of READ_METHODS) expect(m).toMatch(/^(eth_(?!send|sign|accounts)|net_)/);
  });

  it("limits each visitor separately", async () => {
    const { deps } = reads({ limiter: new RateLimiter(2, 60_000) });
    expect((await handleRpcRequest(get(rpc("eth_blockNumber"), "9.9.9.9"), deps)).status).toBe(200);
    expect((await handleRpcRequest(get(rpc("eth_blockNumber"), "9.9.9.9"), deps)).status).toBe(200);
    expect((await handleRpcRequest(get(rpc("eth_blockNumber"), "9.9.9.9"), deps)).status).toBe(429);
    expect((await handleRpcRequest(get(rpc("eth_blockNumber"), "8.8.8.8"), deps)).status).toBe(200);
  });

  it("rejects batches and answers 502 when the node is down", async () => {
    const { deps } = reads({
      forward: async () => {
        throw new Error("boom");
      },
    });
    expect((await handleRpcRequest(get([rpc("eth_blockNumber")]), deps)).status).toBe(400);
    expect((await handleRpcRequest(get(rpc("eth_blockNumber")), deps)).status).toBe(502);
  });
});
