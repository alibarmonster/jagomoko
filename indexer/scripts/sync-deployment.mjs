// Points the indexer at a deployment, from one source of truth.
//
//   forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast   (in ../contracts)
//   bun run sync:deployment                                                 (here)
//
// Reads contracts/deployments/10143.json and
//  - writes the ENVIO_* contract addresses into indexer/.env (every other line is kept,
//    including ENVIO_API_TOKEN, which this script never reads or prints), and
//  - sets the chain's start_block in config.yaml to the block the contracts were deployed at,
//    so the indexer does not scan from genesis.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHAIN_ID = 10143;
const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, `../../contracts/deployments/${CHAIN_ID}.json`);
const envPath = join(here, "../.env");
const configPath = join(here, "../config.yaml");

const VARS = {
  ENVIO_CREATOR_REGISTRY: "CreatorRegistry",
  ENVIO_CHARACTER: "Character",
  ENVIO_SPLIT_VAULT: "SplitVault",
  ENVIO_JURY: "Jury",
  ENVIO_QUEST_ESCROW: "QuestEscrow",
  ENVIO_PREDICTION_BATTLE: "PredictionBattle",
  ENVIO_COMMUNITY_TREASURY: "CommunityTreasury",
  ENVIO_CLIP_BOARD: "ClipBoard",
  ENVIO_TIP_RECEIVER: "TipReceiver",
};

if (!existsSync(source)) {
  console.error(`No deployment found at ${source}. Deploy the contracts first.`);
  process.exit(1);
}
const deployment = JSON.parse(readFileSync(source, "utf8"));
if (deployment.chainId !== CHAIN_ID) {
  console.error(`${source}: expected chain ${CHAIN_ID}, found ${deployment.chainId}`);
  process.exit(1);
}

const addresses = {};
for (const [variable, name] of Object.entries(VARS)) {
  const value = deployment[name];
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    console.error(`${source}: ${name} is missing or not an address`);
    process.exit(1);
  }
  addresses[variable] = value;
}

// ---- .env: replace or append the address lines, keep everything else ----------------------------
const existing = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : [];
const lines = existing.length && existing[existing.length - 1] === "" ? existing.slice(0, -1) : existing;
const seen = new Set();
const next = lines.map((line) => {
  const key = /^([A-Z0-9_]+)=/.exec(line)?.[1];
  if (key && key in addresses) {
    seen.add(key);
    return `${key}=${addresses[key]}`;
  }
  return line;
});
for (const [key, value] of Object.entries(addresses)) if (!seen.has(key)) next.push(`${key}=${value}`);
if (!next.some((l) => l.startsWith("ENVIO_API_TOKEN="))) next.unshift("# HyperSync token: https://envio.dev/app/api-tokens", "ENVIO_API_TOKEN=");
writeFileSync(envPath, next.join("\n") + "\n");

// ---- config.yaml: start_block of the chain ---------------------------------------------------------
if (Number.isInteger(deployment.startBlock) && deployment.startBlock > 0) {
  const yaml = readFileSync(configPath, "utf8");
  const pattern = new RegExp(`(- id: ${CHAIN_ID}[^\\n]*\\r?\\n\\s*start_block:\\s*)\\d+`);
  if (!pattern.test(yaml)) {
    console.error(`config.yaml: could not find start_block under chain ${CHAIN_ID}`);
    process.exit(1);
  }
  writeFileSync(configPath, yaml.replace(pattern, `$1${deployment.startBlock}`));
}

const token = next.find((l) => l.startsWith("ENVIO_API_TOKEN="))?.slice("ENVIO_API_TOKEN=".length);
console.log(`wrote ${envPath}`);
for (const [key, value] of Object.entries(addresses)) console.log(`  ${key.padEnd(26)} ${value}`);
console.log(`  start_block                ${deployment.startBlock}`);
console.log(token ? "  ENVIO_API_TOKEN            set" : "  ENVIO_API_TOKEN            EMPTY (add your token)");

// config.yaml follows the live chain through a QuickNode RPC; HyperSync's free plan is too slow for that.
for (const key of ["QUICKNODE_HTTP_URL", "QUICKNODE_WSS_URL"]) {
  const value = next.find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1);
  console.log(value ? `  ${key.padEnd(26)} set` : `  ${key.padEnd(26)} MISSING (the indexer needs it: your Monad testnet endpoint from quicknode.com)`);
}
