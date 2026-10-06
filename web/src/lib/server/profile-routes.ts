import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { checkName, nameKey, PROFILE_MESSAGE_TTL_MS, profileMessage } from "../profile/name";
import { bearerToken, readBody } from "./jsonrpc";
import type { ProfileStore } from "./profiles";
import type { RateLimiter } from "./ratelimit";

/**
 * /api/profile: a signed-in viewer reads or sets their character's name, which is kept off chain
 * (see lib/profile/name.ts). Setting it takes both the Privy session and a signature from the smart
 * account, so only the account itself can name itself. There is deliberately no lookup by address:
 * nobody can paste an account from the explorer and get its name back from here.
 */

export interface ProfileDeps {
  /** Verifies a Privy access token and returns who it belongs to. Throws if the token is not valid. */
  verifyToken(token: string): Promise<{ userId: string }>;
  /** True if `signature` is `address`'s signature of `message` (smart accounts too: ERC-1271/6492). */
  verifySignature(address: Address, message: string, signature: Hex): Promise<boolean>;
  /** True if a guild already goes by this handle key; false when that cannot be checked. */
  isGuildHandle(key: string): Promise<boolean>;
  store: ProfileStore;
  /** name changes, per user */
  writes: RateLimiter;
  /** reads, per user */
  reads: RateLimiter;
  chainId: number;
  now?: () => number;
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const problem = (status: number, message: string, headers?: HeadersInit) => json({ error: message }, status, headers);

function limited(limiter: RateLimiter, key: string): Response | null {
  const hit = limiter.take(key);
  return hit.ok ? null : problem(429, "Slow down a little.", { "retry-after": String(hit.retryAfterSeconds) });
}

async function signedIn(request: Request, deps: ProfileDeps): Promise<{ userId: string } | Response> {
  const token = bearerToken(request);
  if (!token) return problem(401, "Sign in first.");
  try {
    return await deps.verifyToken(token);
  } catch {
    return problem(401, "Sign in again.");
  }
}

/** GET /api/profile : your own name, if you set one. */
export async function handleProfileGet(request: Request, deps: ProfileDeps): Promise<Response> {
  const who = await signedIn(request, deps);
  if (who instanceof Response) return who;
  const slow = limited(deps.reads, who.userId);
  if (slow) return slow;
  try {
    const profile = await deps.store.byUser(who.userId);
    return profile ? json({ address: profile.address, name: profile.name }) : problem(404, "No name yet.");
  } catch {
    return problem(503, "Names are not available right now.");
  }
}

/** POST /api/profile  { address, name, issuedAt, signature } : sets your name. */
export async function handleProfilePost(request: Request, deps: ProfileDeps): Promise<Response> {
  const who = await signedIn(request, deps);
  if (who instanceof Response) return who;
  const slow = limited(deps.writes, who.userId);
  if (slow) return slow;

  const text = await readBody(request, 8 * 1024);
  if (text === null) return problem(413, "That request is too large.");
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return problem(400, "Send an address, a name, a time and a signature.");
  }
  const { address, name, issuedAt, signature } = body;
  if (typeof address !== "string" || !isAddress(address, { strict: false })) return problem(400, "That is not an account address.");
  if (typeof name !== "string" || name.length > 256) return problem(400, "Give your character a name.");
  if (typeof issuedAt !== "number" || !Number.isSafeInteger(issuedAt)) return problem(400, "That request has no time on it.");
  if (typeof signature !== "string" || !isHex(signature) || signature.length > 8_000) return problem(400, "That request is not signed.");

  const checked = checkName(name);
  if (!checked.ok) return problem(400, checked.error);
  const now = (deps.now ?? Date.now)();
  if (issuedAt > now + 60_000 || now - issuedAt > PROFILE_MESSAGE_TTL_MS) return problem(400, "That request expired. Try again.");

  const account = getAddress(address);
  const message = profileMessage({ address: account, name: checked.name, userId: who.userId, chainId: deps.chainId, issuedAt });
  let valid: boolean;
  try {
    valid = await deps.verifySignature(account, message, signature);
  } catch {
    return problem(503, "We couldn't check your account right now. Try again.");
  }
  if (!valid) return problem(401, "That signature doesn't match your account.");

  const guild = await deps.isGuildHandle(nameKey(checked.name)).catch(() => false);
  if (guild) return problem(409, "A guild already goes by that name. Pick another one.");

  let result;
  try {
    result = await deps.store.claim({ address: account, name: checked.name, userId: who.userId, updatedAt: issuedAt });
  } catch {
    return problem(503, "We couldn't save your name. Try again.");
  }
  if (!result.ok) return problem(409, result.reason === "taken" ? "That name is taken. Pick another one." : "A newer change is already saved.");
  return json({ address: account, name: checked.name });
}
