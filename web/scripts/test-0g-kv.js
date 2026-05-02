#!/usr/bin/env node

/**
 * Test script to check 0G KV node accessibility and fetch marketplace data
 * Supports multiple KV nodes and stream IDs from .env or CLI arguments
 *
 * Usage:
 *   npm run test:0g-kv                           # Use .env config
 *   npm run test:0g-kv -- --node <url>           # Test specific node
 *   npm run test:0g-kv -- --stream <id>          # Test specific stream
 *   npm run test:0g-kv -- --node <url> --stream <id>
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const {
  KvClient,
  Batcher,
  StorageNode,
  FixedPriceFlow__factory,
} = require("@0gfoundation/0g-ts-sdk");

// Load .env.local manually
function loadEnv() {
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
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
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

const kvNodeUrls = kvNodeUrlsStr
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const streamIds = streamIdsStr
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const COUNT_KEY = new TextEncoder().encode("__count");

const KV_TIMEOUT_MS = 5000;

// Helper functions
function encodeKey(s) {
  return new TextEncoder().encode(s);
}

function decodeValue(data) {
  // value.data from KvClient is a base64 string; decode back to UTF-8
  return new TextDecoder().decode(
    Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
  );
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Operation timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

// Write test data using Batcher (blockchain transaction)
async function writeTestData(kvNodeUrl, streamId, testKey, testValue) {
  try {
    console.log("   📌 Note: Write operations require:");
    console.log("      1. A KV node that supports StorageNode API");
    console.log("      2. Valid private key with gas balance");
    console.log("      3. FixedPriceFlow contract on the blockchain");
    console.log();

    const privateKey = process.env.PRIVATE_KEY;
    const evmRpc =
      process.env.NEXT_PUBLIC_0G_EVM_RPC || process.env.GALILEO_RPC;

    if (!privateKey) {
      throw new Error("PRIVATE_KEY not found in .env.local");
    }
    if (!evmRpc) {
      throw new Error("0G EVM RPC not configured");
    }

    console.log("   🔑 Initializing signer...");
    // Create signer
    const provider = new ethers.JsonRpcProvider(evmRpc);
    const signer = new ethers.Wallet(privateKey, provider);
    console.log(`   ✅ Signer: ${signer.address}`);

    // Check signer balance
    try {
      const balance = await withTimeout(
        provider.getBalance(signer.address),
        KV_TIMEOUT_MS,
      );
      const balanceEth = ethers.formatEther(balance);
      console.log(`   💰 Balance: ${balanceEth} ETH`);
      if (balance === 0n) {
        throw new Error(
          "Signer has zero balance - cannot pay for transactions",
        );
      }
    } catch (e) {
      console.log(`   ⚠️  Could not check balance: ${e.message}`);
    }

    // Try StorageNode API
    console.log("   🔄 Attempting StorageNode.getStatus()...");
    const storageNode = new StorageNode(kvNodeUrl);

    let flowAddress;
    try {
      const status = await withTimeout(storageNode.getStatus(), 5000);
      if (
        status &&
        status.networkIdentity &&
        status.networkIdentity.flowAddress
      ) {
        flowAddress = status.networkIdentity.flowAddress;
        console.log(`   ✅ Got flow address: ${flowAddress}`);
      } else {
        throw new Error("No flow address in response");
      }
    } catch (e) {
      console.log(`   ❌ StorageNode.getStatus() not supported: ${e.message}`);
      console.log("   ℹ️  This KV node may not support the StorageNode API");
      throw new Error(
        "Cannot proceed with writes - StorageNode API unavailable",
      );
    }

    // If we got here, proceed with write
    console.log("   🔗 Connecting to flow contract...");
    const flow = FixedPriceFlow__factory.connect(flowAddress, signer);

    console.log("   🔄 Creating batcher...");
    const batcher = new Batcher(1, [storageNode], flow, evmRpc);
    batcher.streamDataBuilder.set(streamId, testKey, testValue);

    console.log("   ⏳ Submitting transaction...");
    const [txHash, err] = await withTimeout(batcher.exec(), 30000);
    if (err) {
      throw new Error(`Batcher exec failed: ${err.message}`);
    }

    return { success: true, txHash };
  } catch (e) {
    return { success: false, error: e.message };
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
  for (const KV_NODE_URL of kvNodeUrls) {
    for (const STREAM_ID of streamIds) {
      totalTests++;
      console.log(
        `📍 Test ${totalTests}: Node="${KV_NODE_URL}" | Stream="${STREAM_ID.slice(
          0,
          16,
        )}...${STREAM_ID.slice(-6)}"`,
      );
      const success = await testNodeStream(KV_NODE_URL, STREAM_ID);
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

async function testNodeStream(KV_NODE_URL, STREAM_ID) {
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
        `   ⚠️  Health check failed (may not be available): ${e.message}`,
      );
    }
    console.log();

    // Test 1: Connect to KV node
    console.log("🔗 Test 1: Connecting to KV node client...");
    const kv = new KvClient(KV_NODE_URL);
    console.log("✅ KvClient created successfully");
    console.log();

    // Test 1b: Write/Read test using blockchain
    console.log(
      "✍️  Test 1b: Write/Read test data (blockchain transaction)...",
    );
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
            readResult.version === 0
              ? "(v0/untouched)"
              : `(v${readResult.version})`;
          let readData;
          if (typeof readResult.data === "string") {
            readData = decodeValue(readResult.data);
          } else if (readResult.data instanceof Uint8Array) {
            readData = new TextDecoder().decode(readResult.data);
          } else if (
            typeof readResult.data === "object" &&
            readResult.data.data instanceof Uint8Array
          ) {
            readData = new TextDecoder().decode(readResult.data.data);
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
        console.log(`   ⚠️  Read failed: ${e.message}`);
      }
    }
    console.log();

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
      console.error(`   ❌ Failed to fetch count: ${e.message}`);
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
    let countData;
    if (typeof countVal.data === "string") {
      countData = decodeValue(countVal.data);
    } else if (countVal.data instanceof Uint8Array) {
      countData = new TextDecoder().decode(countVal.data);
    } else if (typeof countVal.data === "object") {
      if (countVal.data.data instanceof Uint8Array) {
        countData = new TextDecoder().decode(countVal.data.data);
      } else {
        countData = JSON.stringify(countVal.data);
      }
    } else {
      countData = String(countVal.data);
    }

    const count = parseInt(countData, 10) || 0;
    const versionDisplay =
      countVal.version === 0
        ? "version: 0 (untouched/empty)"
        : `version: ${countVal.version}`;
    console.log(`✅ Total listings: ${count} (${versionDisplay})`);

    if (count === 0) {
      console.log("⚠️  No listings found in marketplace");
      return true;
    }

    // Test 3: Fetch individual listings (sample)
    console.log(
      `📥 Test 3: Fetching first ${Math.min(count, 1)} listing(s)...`,
    );
    const listings = [];
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

        let data;
        if (typeof val.data === "string") {
          data = decodeValue(val.data);
        } else if (val.data instanceof Uint8Array) {
          data = new TextDecoder().decode(val.data);
        } else if (
          typeof val.data === "object" &&
          val.data.data instanceof Uint8Array
        ) {
          data = new TextDecoder().decode(val.data.data);
        } else {
          data = JSON.stringify(val.data);
        }

        const listing = JSON.parse(data);
        listings.push(listing);
        const versionStr =
          val.version === 0 ? "(v0/untouched)" : `(v${val.version})`;
        console.log(
          `   [${i}] ✅ ${listing.name} (${listing.category}) ${versionStr}`,
        );
      } catch (e) {
        console.log(`   [${i}] ❌ Failed to parse: ${e.message}`);
        return false;
      }
    }

    console.log(`✅ Successfully fetched ${listings.length} listing(s)`);
    return true;
  } catch (e) {
    console.error(`❌ Test failed: ${e.message}`);

    if (e.message.includes("timed out")) {
      console.error("💡 Suggestion: The KV node may be unreachable or slow.");
      console.error(`   Check if ${KV_NODE_URL} is accessible.`);
    } else if (e.message.includes("ECONNREFUSED")) {
      console.error(
        "💡 Suggestion: Connection refused. The KV node may be offline.",
      );
    } else if (e.message.includes("ENOTFOUND")) {
      console.error(
        "💡 Suggestion: Host not found. Check the KV_NODE_URL configuration.",
      );
    }
    return false;
  }
}

main();
