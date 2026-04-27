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
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

const RPC_URL = process.env.RPC_URL || "https://evmrpc-testnet.0g.ai";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("PRIVATE_KEY is not set");
  process.exit(2);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const broker = await createZGComputeNetworkBroker(wallet);

const [, , subcommand, ...args] = process.argv;

async function fetchInferenceMeta(providerAddress) {
  // Make sure the provider's TEE signer is acknowledged. The SDK auto-acks
  // on transferFund, so we top up with the minimum 1 0G if the sub-account
  // is empty. This is idempotent.
  try {
    const sub = await broker.ledger.getSubAccount(providerAddress, "inference");
    if (sub.balance < 1n * 10n ** 18n) {
      await broker.ledger.transferFund(
        providerAddress,
        "inference",
        1n * 10n ** 18n,
      );
    }
  } catch (e) {
    // First-time sub-account creation throws on `getSubAccount` — fall through
    // to the transfer which creates it.
    await broker.ledger.transferFund(
      providerAddress,
      "inference",
      1n * 10n ** 18n,
    );
  }

  const { endpoint, model } = await broker.inference.getServiceMetadata(
    providerAddress,
  );
  const headers = await broker.inference.getRequestHeaders(providerAddress);

  // Headers are valid for a single request, so the consumer must call this
  // helper for *each* supervisor invocation. That's the right behaviour —
  // headers are billing proofs.
  console.log(JSON.stringify({ endpoint: `${endpoint}/v1/proxy`, model, headers }));
}

async function fundProvider(providerAddress, amountOG) {
  const wei = BigInt(Math.floor(parseFloat(amountOG) * 1e18));
  await broker.ledger.depositFund(parseFloat(amountOG));
  await broker.ledger.transferFund(providerAddress, "inference", wei);
  console.log(JSON.stringify({ ok: true, transferred: amountOG }));
}

async function verifyProvider(providerAddress) {
  const result = await broker.inference.verifyService(
    providerAddress,
    "/tmp/440hz-attestation",
    () => {}, // suppress per-step output; the JSON result is sufficient
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.signerVerification.allMatch || !result.composeVerification.passed) {
    process.exit(3);
  }
}

try {
  if (subcommand === "fetch-inference-meta") {
    await fetchInferenceMeta(args[0]);
  } else if (subcommand === "fund-provider") {
    await fundProvider(args[0], args[1]);
  } else if (subcommand === "verify-provider") {
    await verifyProvider(args[0]);
  } else {
    console.error(`unknown subcommand: ${subcommand}`);
    process.exit(2);
  }
} catch (e) {
  console.error(`zg_broker error: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
}
