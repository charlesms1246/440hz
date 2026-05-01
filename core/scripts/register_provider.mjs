#!/usr/bin/env node
/**
 * register_provider.mjs — Register this machine as a 0G compute provider.
 *
 * Called by core/api/provider.py when POST /provider/register is hit.
 * Reads configuration from environment variables and registers the provider's
 * service endpoint on the 0G Serving contract.
 *
 * The @0glabs/0g-serving-broker SDK (v0.6.5+) exposes provider-side service
 * management via broker.inference and broker.fineTuning namespaces. Specifically,
 * broker.inference.addOrUpdateService() registers a new service (or updates an
 * existing one) on the ServingContract with:
 *   - serviceType: "inference" | "fine-tuning"
 *   - url: publicly accessible endpoint URL
 *   - model: model identifier served
 *   - quota: resource quota
 *   - pricePerToken: in aOG
 *
 * NOTE: The exact provider-side API depends on the SDK version installed. If
 * addOrUpdateService is not available, check node_modules/@0glabs/0g-serving-broker
 * for the current provider API surface.
 *
 * Outputs a JSON object to stdout:
 *   { providerAddress, txHash, endpoint, models, registered: true }
 * Exits non-zero on failure.
 *
 * Env vars:
 *   PRIVATE_KEY              — provider wallet private key (required)
 *   RPC_URL                  — 0G chain RPC (default testnet)
 *   PROVIDER_ENDPOINT        — public URL of this provider API (default localhost)
 *   PROVIDER_MODELS          — comma-separated list of model IDs to register
 *   PROVIDER_PRICE_PER_TOKEN — price in aOG per token (default 1e9)
 *   PROVIDER_SERVICE_TYPE    — "inference" or "fine-tuning" (default "fine-tuning")
 */

import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

const RPC_URL = process.env.RPC_URL || "https://evmrpc-testnet.0g.ai";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ENDPOINT = process.env.PROVIDER_ENDPOINT || "http://localhost:8420";
const MODELS_RAW = process.env.PROVIDER_MODELS || "Qwen/Qwen2.5-7B-Instruct";
const MODELS = MODELS_RAW.split(",").map((m) => m.trim()).filter(Boolean);
const PRICE_PER_TOKEN = BigInt(process.env.PROVIDER_PRICE_PER_TOKEN || "1000000000");
const SERVICE_TYPE = process.env.PROVIDER_SERVICE_TYPE || "fine-tuning";

if (!PRIVATE_KEY) {
  console.error(JSON.stringify({ error: "PRIVATE_KEY is not set" }));
  process.exit(1);
}

async function main() {
  const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, rpcProvider);
  const providerAddress = wallet.address;

  console.error(`[register_provider] wallet: ${providerAddress}`);
  console.error(`[register_provider] endpoint: ${ENDPOINT}`);
  console.error(`[register_provider] models: ${MODELS.join(", ")}`);
  console.error(`[register_provider] service_type: ${SERVICE_TYPE}`);

  const broker = await createZGComputeNetworkBroker(wallet);

  const results = [];

  for (const model of MODELS) {
    console.error(`[register_provider] registering model: ${model}`);
    try {
      // Provider-side service registration.
      // The SDK exposes this via the serving contract wrapper.
      // Try inference namespace first; fall back to direct contract call if unavailable.
      let txHash = null;

      if (broker.inference?.addOrUpdateService) {
        const tx = await broker.inference.addOrUpdateService({
          serviceType: SERVICE_TYPE,
          url: ENDPOINT,
          model,
          quota: { cpuCount: 0, nodeMemory: 0, gpuCount: 1, nodeStorage: 0 },
          pricePerToken: PRICE_PER_TOKEN,
        });
        txHash = tx?.hash || tx;
      } else if (broker.fineTuning?.addOrUpdateService) {
        const tx = await broker.fineTuning.addOrUpdateService({
          url: ENDPOINT,
          model,
          pricePerToken: PRICE_PER_TOKEN,
        });
        txHash = tx?.hash || tx;
      } else {
        // Fallback: call the ServingContract directly.
        // The contract address is discoverable from the broker's internal state.
        const contract =
          broker._servingContract ||
          broker.inference?._contract ||
          broker.fineTuning?._contract;
        if (!contract) {
          throw new Error(
            "Cannot find ServingContract on broker. Check SDK version — " +
            "provider-side registration requires @0glabs/0g-serving-broker >= 0.6.5"
          );
        }
        const tx = await contract.addOrUpdateService(
          SERVICE_TYPE,
          model,
          ENDPOINT,
          PRICE_PER_TOKEN,
          { gasLimit: 500_000 }
        );
        await tx.wait();
        txHash = tx.hash;
      }

      results.push({ model, txHash, registered: true });
      console.error(`[register_provider] registered ${model}: tx=${txHash}`);
    } catch (err) {
      console.error(`[register_provider] failed to register ${model}: ${err.message}`);
      results.push({ model, error: err.message, registered: false });
    }
  }

  const allOk = results.every((r) => r.registered);
  const output = {
    providerAddress,
    endpoint: ENDPOINT,
    serviceType: SERVICE_TYPE,
    models: MODELS,
    results,
    registered: allOk,
    txHash: results.find((r) => r.txHash)?.txHash || null,
  };

  // Write the final JSON result to stdout for the Python caller to parse.
  process.stdout.write(JSON.stringify(output) + "\n");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(`[register_provider] fatal: ${err.message}`);
  process.stdout.write(JSON.stringify({ error: err.message, registered: false }) + "\n");
  process.exit(1);
});
