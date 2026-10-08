// Copies a Foundry deployment into the web app, so every address comes from one place.
//
//   forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast   (in ../contracts)
//   bun run sync:deployment
//
// Reads contracts/deployments/10143.json (written by Deploy.s.sol), writes
// src/lib/chain/deployment.json. The indexer takes the same addresses through ENVIO_* env vars.
// Cross-chain tip senders come from the source chains' files (11155111.json for Sepolia), when
// they exist.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHAIN_ID = 10143;
const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, `../../contracts/deployments/${CHAIN_ID}.json`);
const target = join(here, "../src/lib/chain/deployment.json");

if (!existsSync(source)) {
  console.error(`No deployment found at ${source}. Run the deploy script first.`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(source, "utf8"));
const NAMES = [
  "MockUSD",
  "MockYieldVault",
  "CreatorRegistry",
  "Character",
  "SplitVault",
  "Jury",
  "QuestEscrow",
  "PredictionBattle",
  "CommunityTreasury",
];
// deployed later (DeployClipBoard.s.sol, DeployV2.s.sol, DeployPracticeFaucet.s.sol); without them that feature stays switched off
const OPTIONAL = ["ClipBoard", "MockMON", "MokoSwap", "MockLST", "LstStrategy", "CommunityPoolVault", "TipReceiver", "PracticeFaucet"];
// chains a viewer can tip from (DeployTipSender.s.sol writes their files)
const SOURCES = [{ chainId: 11155111, eid: 40161, name: "Ethereum Sepolia", short: "Sepolia", explorer: "https://sepolia.etherscan.io" }];

const contracts = {};
for (const name of NAMES) {
  if (typeof raw[name] !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(raw[name])) {
    console.error(`${source}: ${name} is missing or not an address`);
    process.exit(1);
  }
  contracts[name] = raw[name];
}
for (const name of OPTIONAL) {
  if (raw[name] === undefined) {
    console.warn(`${name} is not deployed yet: that feature stays switched off.`);
    continue;
  }
  if (typeof raw[name] !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(raw[name])) {
    console.error(`${source}: ${name} is not an address`);
    process.exit(1);
  }
  contracts[name] = raw[name];
}
if (raw.chainId !== CHAIN_ID) {
  console.error(`${source}: expected chain ${CHAIN_ID}, found ${raw.chainId}`);
  process.exit(1);
}

const sources = [];
for (const src of SOURCES) {
  const file = join(here, `../../contracts/deployments/${src.chainId}.json`);
  if (!existsSync(file)) continue;
  const d = JSON.parse(readFileSync(file, "utf8"));
  if (typeof d.TipSender !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(d.TipSender)) {
    console.error(`${file}: TipSender is not an address`);
    process.exit(1);
  }
  if (d.TipReceiver !== contracts.TipReceiver) {
    console.warn(`${file}: its TipSender points at another TipReceiver, so it is skipped.`);
    continue;
  }
  sources.push({ ...src, tipSender: d.TipSender });
}
if (contracts.TipReceiver && sources.length === 0) console.warn("No tip sender is deployed yet: cross-chain tips stay switched off.");

writeFileSync(target, JSON.stringify({ chainId: CHAIN_ID, deployed: true, startBlock: raw.startBlock ?? 0, contracts, sources }, null, 2) + "\n");
console.log(`wrote ${target}`);
for (const [name, address] of Object.entries(contracts)) console.log(`  ${name.padEnd(18)} ${address}`);
for (const src of sources) console.log(`  TipSender on ${src.short.padEnd(8)} ${src.tipSender}`);
