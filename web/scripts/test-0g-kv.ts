#!/usr/bin/env node

/**
 * Test script to check 0G KV node accessibility and fetch marketplace data (TypeScript version)
 * Supports multiple KV nodes and stream IDs from .env or CLI arguments
 * 
 * Usage:
 *   npx ts-node scripts/test-0g-kv.ts                    # Use .env config
 *   npx ts-node scripts/test-0g-kv.ts --node <url>       # Test specific node
 *   npx ts-node scripts/test-0g-kv.ts --stream <id>      # Test specific stream
 */

import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import {
  KvClient,
  Batcher,
  StorageNode,
  FixedPriceFlow__factory,
} from "@0gfoundation/0g-ts-sdk";

// Load .env.local manually
function loadEnv(): void {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=").replace(/^"(.*)"$/, "$1");
        if (key && value) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnv();

// Parse command-line arguments
function parseArgs(): { node?: string; stream?: string } {
  const args = process.argv.slice(2);
  const result: { node?: string; stream?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--node" && args[i + 1]) {
      result.node = args[i + 1];
      i++;
    } else if (args[i] === "--stream" && args[i + 1]) {
      result.stream = args[i + 1];
      i++;
    }
  }
  return result;
}

// Load config from environment or CLI args
const cliArgs = parseArgs();

// Get KV node URLs: CLI arg > env NEXT_PUBLIC_0G_KV_NODE_URLS > env NEXT_PUBLIC_0G_KV_NODE_URL
const kvNodeUrlsStr =
  cliArgs.node ||
  process.env.NEXT_PUBLIC_0G_KV_NODE_URLS ||
  process.env.NEXT_PUBLIC_0G_KV_NODE_URL ||
  "http://178.238.236.119:6789";

// Get stream IDs: CLI arg > env NEXT_PUBLIC_0G_STREAM_IDS > env NEXT_PUBLIC_0G_MARKETPLACE_STREAM_ID
const streamIdsStr =
  cliArgs.stream ||
  process.env.NEXT_PUBLIC_0G_STREAM_IDS ||
  process.env.NEXT_PUBLIC_0G_MARKETPLACE_STREAM_ID ||
  "0x8a6a818b3b7800eee82a2fc80545c0103c35868349472be3d33149f778883c0f";

const kvNodeUrls = kvNodeUrlsStr.split(",").map((s) => s.trim()).filter(Boolean);
const streamIds = streamIdsStr.split(",").map((s) => s.trim()).filter(Boolean);
const COUNT_KEY = new TextEncoder().encode("__count");
const KV_TIMEOUT_MS = 5000;

interface MarketListing {
  rootHash: string;
  name: string;
  description: string;
  category: string;
  complexity: number;
  license: string;
  cost: string;
  publishedAt: string;
  publishedBy: string;
  rating?: number;
  downloads?: number;
}

// Helper functions
function encodeKey(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function decodeValue(data: string): string {
  // value.data from KvClient is a base64 string; decode back to UTF-8
  return new TextDecoder().decode(
    Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Operation timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

// Write test data using Batcher (blockchain transaction)
async function writeTestData(
  kvNodeUrl: string,
  streamId: string,
  testKey: Uint8Array,
  testValue: Uint8Array,
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    const evmRpc =
      process.env.NEXT_PUBLIC_0G_EVM_RPC || process.env.GALILEO_RPC;

    if (!privateKey) {
      throw new Error("PRIVATE_KEY not found in .env.local");
    }
    if (!evmRpc) {
      throw new Error("0G EVM RPC not configured");
    }

    // Create signer
    const provider = new ethers.JsonRpcProvider(evmRpc);
    const signer = new ethers.Wallet(privateKey, provider);

    // Get flow contract address from node
    const storageNode = new StorageNode(kvNodeUrl);
    const status = await withTimeout(storageNode.getStatus(), KV_TIMEOUT_MS);
    if (!status || !status.networkIdentity || !status.networkIdentity.flowAddress) {
      throw new Error("Failed to get flow contract address from node");
    }

    const flowAddress = status.networkIdentity.flowAddress;

    // Create flow contract
    const flow = FixedPriceFlow__factory.connect(flowAddress, signer);

    // Create batcher and add data
    const batcher = new Batcher(1, [storageNode], flow, evmRpc);
    batcher.streamDataBuilder.set(streamId, testKey, testValue);

    // Execute transaction
    const [txHash, err] = await withTimeout(batcher.exec(), 30000); // 30s timeout for tx
    if (err) {
      throw new Error(`Batcher execution failed: ${err.message}`);
    }

    return { success: true, txHash };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

async function main() {
  console.log("🔍 0G KV Node Test Script (Multi-node/Stream Support)");
  console.log("=".repeat(60));
  console.log();

  // Display configuration
  console.log("📋 Configuration:");
  console.log(`   KV Nodes:  ${kvNodeUrls.join(", ")}`);
  console.log(`   Streams:   ${streamIds.join(", ")}`);
  console.log(`   Timeout:   ${KV_TIMEOUT_MS}ms`);
  console.log();

  let totalTests = 0;
  let passedTests = 0;

  // Test each combination of node and stream
  for (const kvNodeUrl of kvNodeUrls) {
    for (const streamId of streamIds) {
      totalTests++;
      console.log(
        `📍 Test ${totalTests}: Node="${kvNodeUrl}" | Stream="${streamId.slice(0, 16)}...${streamId.slice(-6)}"`
      );
      const success = await testNodeStream(kvNodeUrl, streamId);
      if (success) passedTests++;
      console.log();
    }
  }

  // Summary
  console.log("=".repeat(60));
  console.log(`✨ Results: ${passedTests}/${totalTests} tests passed`);
  if (passedTests < totalTests) {
    console.log(`⚠️  ${totalTests - passedTests} test(s) failed`);
  } else {
    console.log("✅ All tests passed!");
  }
}

async function testNodeStream(
  KV_NODE_URL: string,
  STREAM_ID: string,
): Promise<boolean> {
  try {
    // Test 0: Basic connectivity
    console.log("🌐 Test 0: Basic HTTP connectivity...");
    try {
      const response = await withTimeout(
        fetch(`${KV_NODE_URL}/health`, { method: "GET" }),
        KV_TIMEOUT_MS,
      );
      console.log(`   ✅ HTTP endpoint reachable (status: ${response.status})`);
    } catch (e) {
      console.log(
        `   ⚠️  Health check failed (may not be available): ${(e as Error).message}`,
      );
    }

    // Test 1: Connect to KV node
    console.log("🔗 Test 1: Connecting to KV node client...");
    const kv = new KvClient(KV_NODE_URL);
    console.log("✅ KvClient created successfully");

    // Test 1b: Write/Read test using blockchain
    console.log("✍️  Test 1b: Write/Read test data (blockchain transaction)...");
    const testKeyStr = "__test_kv_write";
    const testKeyEncoded = encodeKey(testKeyStr);
    const testValue = "test_value_" + Date.now();
    const testValueEncoded = new TextEncoder().encode(testValue);

    console.log(`   📝 Writing key: ${testKeyStr}`);
    console.log(`   📝 Writing value: ${testValue}`);

    const writeResult = await writeTestData(
      KV_NODE_URL,
      STREAM_ID,
      testKeyEncoded,
      testValueEncoded,
    );

    if (!writeResult.success) {
      console.log(`   ❌ Write failed: ${writeResult.error}`);
      console.log(
        "   💡 Note: Requires valid private key and sufficient gas balance",
      );
    } else {
      console.log(`   ✅ Write successful! Tx: ${writeResult.txHash}`);

      // Wait a moment for indexing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Read it back
      try {
        const readResult = await withTimeout(
          kv.getValue(STREAM_ID, testKeyEncoded),
          KV_TIMEOUT_MS,
        );

        if (readResult) {
          const versionStr =
            (readResult as any).version === 0
              ? "(v0/untouched)"
              : `(v${(readResult as any).version})`;
          let readData: string;
          if (typeof readResult.data === "string") {
            readData = decodeValue(readResult.data);
          } else if (readResult.data instanceof Uint8Array) {
            readData = new TextDecoder().decode(readResult.data);
          } else if (
            typeof readResult.data === "object" &&
            (readResult.data as any).data instanceof Uint8Array
          ) {
            readData = new TextDecoder().decode(
              (readResult.data as any).data,
            );
          } else {
            readData = JSON.stringify(readResult.data);
          }

          console.log(`   📖 Read back: ${readData} ${versionStr}`);
          if (readData === testValue) {
            console.log("   ✅ Write/Read verification passed!");
          } else {
            console.log(
              `   ⚠️  Value mismatch! Expected: ${testValue}, Got: ${readData}`,
            );
          }
        } else {
          console.log("   ⚠️  Read returned no data (may be indexing delay)");
        }
      } catch (e) {
        console.log(`   ⚠️  Read failed: ${(e as Error).message}`);
      }
    }

    // Test 2: Fetch count key
    console.log("📊 Test 2: Fetching listing count...");
    console.log(`   📍 Using Stream ID: ${STREAM_ID}`);
    console.log(`   📍 Using Key: __count`);
    let countVal;
    try {
      countVal = await withTimeout(
        kv.getValue(STREAM_ID, COUNT_KEY),
        KV_TIMEOUT_MS,
      );
    } catch (e) {
      console.error(`   ❌ Failed to fetch count: ${(e as Error).message}`);
      console.error();
      console.error("   💡 Possible causes:");
      console.error("      1. Stream does not exist on this KV node");
      console.error("      2. The stream ID is incorrect");
      console.error("      3. The KV node version or format has changed");
      console.error(
        "      4. Node is in a different state (maintenance, resyncing, etc.)",
      );
      return false;
    }

    if (!countVal) {
      console.log("⚠️  No count key found (stream may be empty)");
      return false;
    }

    // Handle different data formats
    let countData: string;
    if (typeof countVal.data === "string") {
      countData = decodeValue(countVal.data);
    } else if (countVal.data instanceof Uint8Array) {
      countData = new TextDecoder().decode(countVal.data);
    } else if (
      typeof countVal.data === "object" &&
      (countVal.data as any).data instanceof Uint8Array
    ) {
      countData = new TextDecoder().decode((countVal.data as any).data);
    } else {
      countData = JSON.stringify(countVal.data);
    }

    const count = parseInt(countData, 10) || 0;
    const versionDisplay =
      (countVal as any).version === 0
        ? "version: 0 (untouched/empty)"
        : `version: ${(countVal as any).version}`;
    console.log(`✅ Total listings: ${count} (${versionDisplay})`);

    if (count === 0) {
      console.log("⚠️  No listings found in marketplace");
      return true;
    }

    // Test 3: Fetch individual listings (sample)
    console.log(
      `📥 Test 3: Fetching first ${Math.min(count, 1)} listing(s)...`,
    );
    const listings: MarketListing[] = [];
    for (let i = 0; i < Math.min(count, 1); i++) {
      try {
        const val = await withTimeout(
          kv.getValue(STREAM_ID, encodeKey(String(i))),
          KV_TIMEOUT_MS,
        );
        if (!val) {
          console.log(`   [${i}] ⚠️  Entry not found`);
          continue;
        }

        let data: string;
        if (typeof val.data === "string") {
          data = decodeValue(val.data);
        } else if (val.data instanceof Uint8Array) {
          data = new TextDecoder().decode(val.data);
        } else if (
          typeof val.data === "object" &&
          (val.data as any).data instanceof Uint8Array
        ) {
          data = new TextDecoder().decode((val.data as any).data);
        } else {
          data = JSON.stringify(val.data);
        }

        const listing = JSON.parse(data) as MarketListing;
        listings.push(listing);
        const versionStr =
          (val as any).version === 0 ? "(v0/untouched)" : `(v${(val as any).version})`;
        console.log(
          `   [${i}] ✅ ${listing.name} (${listing.category}) ${versionStr}`,
        );
      } catch (e) {
        console.log(`   [${i}] ❌ Failed to parse: ${(e as Error).message}`);
        return false;
      }
    }

    console.log(`✅ Successfully fetched ${listings.length} listing(s)`);
    return true;
  } catch (e) {
    console.error();
    console.error("❌ Test failed:");
    const errorMsg = (e as Error).message;
    console.error(`   Error: ${errorMsg}`);
    console.log(`✅ Successfully fetched ${listings.length} listing(s)`);
    return true;
  } catch (e) {
    console.error(`❌ Test failed: ${(e as Error).message}`);

    if ((e as Error).message.includes("timed out")) {
      console.error(
        "💡 Suggestion: The KV node may be unreachable or slow.",
      );
      console.error(`   Check if ${KV_NODE_URL} is accessible.`);
    } else if ((e as Error).message.includes("ECONNREFUSED")) {
      console.error(
        "💡 Suggestion: Connection refused. The KV node may be offline.",
      );
    } else if ((e as Error).message.includes("ENOTFOUND")) {
      console.error(
        "💡 Suggestion: Host not found. Check the KV_NODE_URL configuration.",
      );
    }
    return false;
  }
}

main();
