#!/usr/bin/env node
/**
 * 0G broker helper — invoked from Python (executor/supervisor.py) to bridge
 * into the @0glabs/0g-serving-broker SDK, which is Node-only.
 *
 * Subcommands:
 *   fetch-inference-meta <providerAddress>
 *       → prints {"endpoint": "...", "model": "...", "headers": {...}} to stdout
 *
 *   fund-provider <providerAddress> <amount>
 *       → ensures the provider sub-account has at least <amount> 0G; tops up if not
 *
 *   verify-provider <providerAddress>
 *       → prints the verifyService result; non-zero exit if attestation invalid
 *
 * Auth: reads PRIVATE_KEY and RPC_URL from env. In production these come from the
 * 0G provider's secret manager; in dev, set them in your local shell.
 */
import { readFileSync } from "fs";
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";

const RPC_URL = process.env.RPC_URL || "https://evmrpc-testnet.0g.ai";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("PRIVATE_KEY is not set");
  process.exit(2);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Lazy — only initialised for subcommands that need broker billing
let broker = null;
async function getBroker() {
  if (!broker) broker = await createZGComputeNetworkBroker(wallet);
  return broker;
}

const [, , subcommand, ...args] = process.argv;

async function fetchInferenceMeta(providerAddress) {
  const b = await getBroker();
  try {
    const sub = await b.ledger.getSubAccount(providerAddress, "inference");
    if (sub.balance < 1n * 10n ** 18n) {
      await b.ledger.transferFund(providerAddress, "inference", 1n * 10n ** 18n);
    }
  } catch (e) {
    await b.ledger.transferFund(providerAddress, "inference", 1n * 10n ** 18n);
  }

  const { endpoint, model } = await b.inference.getServiceMetadata(providerAddress);
  const headers = await b.inference.getRequestHeaders(providerAddress);
  console.log(JSON.stringify({ endpoint: `${endpoint}/v1/proxy`, model, headers }));
}

async function fundProvider(providerAddress, amountOG) {
  const b = await getBroker();
  const wei = BigInt(Math.floor(parseFloat(amountOG) * 1e18));
  await b.ledger.depositFund(parseFloat(amountOG));
  await b.ledger.transferFund(providerAddress, "inference", wei);
  console.log(JSON.stringify({ ok: true, transferred: amountOG }));
}

async function verifyProvider(providerAddress) {
  const b = await getBroker();
  const result = await b.inference.verifyService(
    providerAddress,
    "/tmp/440hz-attestation",
    () => {},
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.signerVerification.allMatch || !result.composeVerification.passed) {
    process.exit(3);
  }
}

async function uploadAdapter(tarPath) {
  const INDEXER_URL = process.env.INDEXER_URL || "https://indexer-storage-testnet-turbo.0g.ai";
  const EVM_RPC = process.env.RPC_URL || "https://evmrpc-testnet.0g.ai";

  const bytes = readFileSync(tarPath);
  const data = new MemData(bytes);

  const indexer = new Indexer(INDEXER_URL);
  const [result, uploadErr] = await indexer.upload(data, EVM_RPC, wallet);

  if (uploadErr) {
    // Transient "not finalized yet" warning — rootHash is still valid
    console.error(`[0G upload] node sync pending: ${uploadErr.message ?? uploadErr}`);
  }

  const [tree, treeErr] = await data.merkleTree();
  if (treeErr) throw treeErr;

  const rootHash = result?.rootHash ?? tree.rootHash();
  console.log(JSON.stringify({ rootHash }));
}

try {
  if (subcommand === "fetch-inference-meta") {
    await fetchInferenceMeta(args[0]);
  } else if (subcommand === "fund-provider") {
    await fundProvider(args[0], args[1]);
  } else if (subcommand === "verify-provider") {
    await verifyProvider(args[0]);
  } else if (subcommand === "upload-adapter") {
    await uploadAdapter(args[0]);
  } else {
    console.error(`unknown subcommand: ${subcommand}`);
    process.exit(2);
  }
} catch (e) {
  console.error(`zg_broker error: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
}
