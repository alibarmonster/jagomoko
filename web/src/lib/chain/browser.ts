import { createPublicClient, http } from "viem";
import { monadTestnet } from "./config";

/** Browser-only helpers: they use window.location, so import them from client components and hooks. */

const absolute = (path: string) => new URL(path, window.location.origin).toString();

/** The bundler and paymaster endpoint. It adds the Pimlico key on the server. */
export const aaUrl = () => absolute("/api/aa");

function create() {
  // No batching: /api/rpc takes one request at a time.
  return createPublicClient({ chain: monadTestnet, transport: http(absolute("/api/rpc")) });
}

let client: ReturnType<typeof create> | undefined;

/** Reads go through /api/rpc, so a private RPC token never reaches the browser. */
export function browserPublicClient() {
  client ??= create();
  return client;
}
