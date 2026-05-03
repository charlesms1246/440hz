"use client";

import { BrowserProvider, JsonRpcSigner } from "ethers";
import {
  KvClient,
  Batcher,
  StorageNode,
  FixedPriceFlow__factory,
} from "@0gfoundation/0g-ts-sdk";
import { switchChain } from "@wagmi/core";
import { wagmiConfig, zeroGGalileo } from "@/lib/wagmi";

// ── Network constants (from .env.local) ──────────────────────────
const EVM_RPC =
  process.env.NEXT_PUBLIC_0G_EVM_RPC || "https://evmrpc-testnet.0g.ai";
const KV_NODE_URL =
  process.env.NEXT_PUBLIC_0G_KV_NODE_URL || "http://178.238.236.119:6789";
const STREAM_ID =
  process.env.NEXT_PUBLIC_0G_MARKETPLACE_STREAM_ID ||
  "0x8a6a818b3b7800eee82a2fc80545c0103c35868349472be3d33149f778883c0f";
// Flow contract on 0G Galileo testnet (same address used by the storage upload route)
const FLOW_ADDRESS =
  process.env.NEXT_PUBLIC_0G_FLOW_ADDRESS || "0x22e03a6a89b950f1c82ec5e74f8eca321a105296";
const COUNT_KEY = new TextEncoder().encode("__count");
const KV_TIMEOUT_MS = 8000;

// ── Types ─────────────────────────────────────────────────────────

export type MarketListing = {
  rootHash: string;
  name: string;
  description: string;
  category: "Coding" | "Trading" | "Physics" | "Robotics" | "Math" | "Language";
  complexity: number; // 0–100
  license: "Open" | "Pro" | "Enterprise";
  cost: string; // 'Free' or '120 $0G'
  publishedAt: string;
  publishedBy: string; // wallet address (lowercased)
  rating?: number;
  downloads?: number;
};

// ── Internal helpers ──────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("KV timeout")), ms),
    ),
  ]);
}

function encodeKey(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function decodeValue(data: string): string {
  // value.data from KvClient is a base64 string; decode back to UTF-8
  return new TextDecoder().decode(
    Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
  );
}

// Returns a signer from the already-connected wallet without any popup.
// Uses eth_accounts (no eth_requestAccounts call) + JsonRpcSigner by address.
async function getConnectedSigner(): Promise<JsonRpcSigner> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eth = typeof window !== "undefined" && (window as any).ethereum;
  if (!eth) throw new Error("No injected wallet found. Connect a wallet first.");
  // Switch to 0G Galileo without showing a wallet picker
  await switchChain(wagmiConfig, { chainId: zeroGGalileo.id });
  const accounts: string[] = await eth.request({ method: "eth_accounts" });
  if (!accounts?.length) throw new Error("Connect your wallet first.");
  const provider = new BrowserProvider(eth, zeroGGalileo.id);
  return new JsonRpcSigner(provider, accounts[0]);
}

// ── KV read ───────────────────────────────────────────────────────

async function fetchFromKv(): Promise<MarketListing[]> {
  const kv = new KvClient(KV_NODE_URL);

  const countVal = await kv.getValue(STREAM_ID, COUNT_KEY);
  if (!countVal) return [];

  const count = parseInt(decodeValue(countVal.data), 10) || 0;
  if (count === 0) return [];

  const results: MarketListing[] = [];
  for (let i = 0; i < count; i++) {
    const val = await kv.getValue(STREAM_ID, encodeKey(String(i)));
    if (!val) continue;
    try {
      results.push(JSON.parse(decodeValue(val.data)) as MarketListing);
    } catch {
      // skip malformed entries
    }
  }
  return results.reverse(); // newest first
}

// ── KV write ──────────────────────────────────────────────────────

async function publishToKv(listing: MarketListing): Promise<void> {
  const signer = await getConnectedSigner();
  const kv = new KvClient(KV_NODE_URL);
  const storageNode = new StorageNode(KV_NODE_URL);

  // Use hardcoded flow address — storageNode.getStatus() returns -32601 on this node
  const flow = FixedPriceFlow__factory.connect(FLOW_ADDRESS, signer);

  // Read current count
  const countVal = await kv.getValue(STREAM_ID, COUNT_KEY);
  const count = countVal ? parseInt(decodeValue(countVal.data), 10) || 0 : 0;

  // Build and submit both writes atomically in one batcher.exec() call
  const batcher = new Batcher(1, [storageNode], flow, EVM_RPC);
  batcher.streamDataBuilder.set(
    STREAM_ID,
    encodeKey(String(count)),
    new TextEncoder().encode(JSON.stringify(listing)),
  );
  batcher.streamDataBuilder.set(
    STREAM_ID,
    COUNT_KEY,
    new TextEncoder().encode(String(count + 1)),
  );

  const [, err] = await batcher.exec();
  if (err) throw err;
}

// ── Public API ────────────────────────────────────────────────────

export async function fetchMarketListings(): Promise<MarketListing[]> {
  // Merge results from both sources: KV node (on-chain) + Upstash (server fallback).
  // KV is the canonical decentralised store; Upstash catches listings written during KV downtime.
  const [kvListings, upstashListings] = await Promise.allSettled([
    withTimeout(fetchFromKv(), KV_TIMEOUT_MS),
    fetch("/api/marketplace").then(r => r.ok ? r.json() as Promise<MarketListing[]> : []),
  ]);

  const kv = kvListings.status === "fulfilled" ? kvListings.value : [];
  const up = upstashListings.status === "fulfilled" ? upstashListings.value : [];

  // Deduplicate by rootHash, preferring KV entries
  const seen = new Set<string>();
  const merged: MarketListing[] = [];
  for (const item of [...kv, ...up]) {
    if (!seen.has(item.rootHash)) {
      seen.add(item.rootHash);
      merged.push(item);
    }
  }
  return merged;
}

export type GymStats = {
  downloads: number
  ratingSum: number
  ratingCount: number
}

export async function fetchGymStats(rootHashes: string[]): Promise<Record<string, GymStats>> {
  if (rootHashes.length === 0) return {}
  const res = await fetch(`/api/marketplace/stats?hashes=${rootHashes.join(',')}`)
  if (!res.ok) return {}
  return res.json() as Promise<Record<string, GymStats>>
}

export async function trackGymDownload(rootHash: string): Promise<void> {
  await fetch('/api/marketplace/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rootHash, action: 'download' }),
  }).catch(() => {})
}

export async function rateGym(rootHash: string, value: number): Promise<void> {
  await fetch('/api/marketplace/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rootHash, action: 'rate', value }),
  })
}

export async function publishGymListing(listing: MarketListing): Promise<void> {
  // Write to 0G KV node (on-chain, decentralised) first.
  // Fall back to Upstash (server-side) if the KV node is unavailable.
  try {
    await withTimeout(publishToKv(listing), KV_TIMEOUT_MS);
    // Mirror to Upstash so the listing survives a KV node outage
    fetch("/api/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listing),
    }).catch(() => {});
  } catch {
    // KV write failed — persist to Upstash so the listing isn't lost
    const res = await fetch("/api/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listing),
    });
    if (!res.ok)
      throw new Error("Marketplace publish failed on both 0G KV and Upstash");
  }
}
