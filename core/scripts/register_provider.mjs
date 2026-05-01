#!/usr/bin/env node
/**
 * register_provider.mjs — Register this machine as a 0G fine-tuning provider.
 *
 * Calls addOrUpdateService on the 0G FineTuning serving contract directly,
 * using the ABI discovered from @0glabs/0g-serving-broker v0.6.x.
 *
 * Env vars:
 *   PRIVATE_KEY               — provider wallet private key (required)
 *   RPC_URL                   — 0G chain RPC (default: testnet)
 *   PROVIDER_ENDPOINT         — public URL consumers reach this provider at
 *   PROVIDER_MODELS           — comma-separated HF model IDs
 *   PROVIDER_PRICE_PER_TOKEN  — aOG per token (default 1e9 = 1 nOG)
 *   PROVIDER_CPU_COUNT        — CPU cores to advertise (default 8)
 *   PROVIDER_MEMORY_GB        — RAM in GB (default 64)
 *   PROVIDER_GPU_COUNT        — GPU count (default 1)
 *   PROVIDER_STORAGE_GB       — Storage in GB (default 200)
 *   PROVIDER_GPU_TYPE         — GPU model string, e.g. "A100" (default "")
 *
 * Outputs JSON to stdout:
 *   { providerAddress, txHash, registered: true, endpoint, models }
 * Exits non-zero on failure.
 */

import { ethers } from "ethers";

const RPC_URL        = process.env.RPC_URL || "https://evmrpc-testnet.0g.ai";
const _rawKey        = process.env.PRIVATE_KEY;
// ethers v6 requires 0x prefix for hex private keys
const PRIVATE_KEY    = _rawKey && !_rawKey.startsWith("0x") ? "0x" + _rawKey : _rawKey;
const ENDPOINT       = process.env.PROVIDER_ENDPOINT || "http://localhost:8420";
const MODELS_RAW     = process.env.PROVIDER_MODELS || "Qwen/Qwen2.5-7B-Instruct";
const MODELS         = MODELS_RAW.split(",").map(m => m.trim()).filter(Boolean);
const PRICE          = BigInt(process.env.PROVIDER_PRICE_PER_TOKEN || "1000000000");
const CPU_COUNT      = BigInt(process.env.PROVIDER_CPU_COUNT  || "8");
const MEMORY_GB      = BigInt(process.env.PROVIDER_MEMORY_GB  || "64");
const GPU_COUNT      = BigInt(process.env.PROVIDER_GPU_COUNT  || "1");
const STORAGE_GB     = BigInt(process.env.PROVIDER_STORAGE_GB || "200");
const GPU_TYPE       = process.env.PROVIDER_GPU_TYPE || "";

// Contract addresses — from @0glabs/0g-serving-broker CONTRACT_ADDRESSES.testnet
const FINE_TUNING_CONTRACT = "0xaC66eBd174435c04F1449BBa08157a707B6fa7b1";

const ABI = [
  "function addOrUpdateService(string url, tuple(uint256 cpuCount, uint256 nodeMemory, uint256 gpuCount, uint256 nodeStorage, string gpuType) quota, uint256 pricePerToken, address providerSigner, bool occupied, string[] models)",
  "function getService(address provider) view returns (tuple(string url, tuple(uint256 cpuCount, uint256 nodeMemory, uint256 gpuCount, uint256 nodeStorage, string gpuType) quota, uint256 pricePerToken, address providerSigner, bool occupied, string[] models))",
  "function removeService()",
];

if (!PRIVATE_KEY) {
  process.stderr.write("[register_provider] PRIVATE_KEY is not set\n");
  process.stdout.write(JSON.stringify({ error: "PRIVATE_KEY is not set", registered: false }) + "\n");
  process.exit(1);
}

async function main() {
  const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet      = new ethers.Wallet(PRIVATE_KEY, rpcProvider);
  const address     = wallet.address;

  process.stderr.write(`[register_provider] wallet: ${address}\n`);
  process.stderr.write(`[register_provider] endpoint: ${ENDPOINT}\n`);
  process.stderr.write(`[register_provider] models: ${MODELS.join(", ")}\n`);
  process.stderr.write(`[register_provider] pricePerToken: ${PRICE.toString()} aOG\n`);
  process.stderr.write(`[register_provider] quota: cpu=${CPU_COUNT} mem=${MEMORY_GB}GB gpu=${GPU_COUNT}x${GPU_TYPE || "?"} storage=${STORAGE_GB}GB\n`);

  const contract = new ethers.Contract(FINE_TUNING_CONTRACT, ABI, wallet);

  const quota = {
    cpuCount:    CPU_COUNT,
    nodeMemory:  MEMORY_GB,
    gpuCount:    GPU_COUNT,
    nodeStorage: STORAGE_GB,
    gpuType:     GPU_TYPE,
  };

  process.stderr.write("[register_provider] calling addOrUpdateService…\n");
  const tx = await contract.addOrUpdateService(
    ENDPOINT,
    quota,
    PRICE,
    address,   // providerSigner = same as wallet address
    false,     // occupied = false (available for jobs)
    MODELS,
    { gasLimit: 500_000 },
  );

  process.stderr.write(`[register_provider] tx submitted: ${tx.hash}\n`);
  const receipt = await tx.wait();
  process.stderr.write(`[register_provider] confirmed in block ${receipt.blockNumber}\n`);

  const result = {
    providerAddress: address,
    txHash:          tx.hash,
    blockNumber:     receipt.blockNumber,
    endpoint:        ENDPOINT,
    models:          MODELS,
    pricePerToken:   PRICE.toString(),
    registered:      true,
  };

  process.stdout.write(JSON.stringify(result) + "\n");
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`[register_provider] fatal: ${err.message}\n`);
  process.stdout.write(JSON.stringify({ error: err.message, registered: false }) + "\n");
  process.exit(1);
});
