'use client'

import { BrowserProvider } from 'ethers'
import { KvClient, Batcher, StorageNode, FixedPriceFlow__factory } from '@0gfoundation/0g-ts-sdk'

// ── Network constants ─────────────────────────────────────────────
const EVM_RPC       = 'https://evmrpc-testnet.0g.ai'
// 0G Galileo testnet KV node
const KV_NODE_URL   = 'http://178.238.236.119:6789'
// 440hz marketplace stream ID on 0G Galileo testnet
const STREAM_ID     = '0x8a6a818b3b7800eee82a2fc80545c0103c35868349472be3d33149f778883c0f'
const COUNT_KEY     = new TextEncoder().encode('__count')
const KV_TIMEOUT_MS = 5000

// ── Types ─────────────────────────────────────────────────────────

export type MarketListing = {
  rootHash: string
  name: string
  description: string
  category: 'Coding' | 'Trading' | 'Physics' | 'Robotics' | 'Math' | 'Language'
  complexity: number       // 0–100
  license: 'Open' | 'Pro' | 'Enterprise'
  cost: string             // 'Free' or '120 $0G'
  publishedAt: string
  publishedBy: string      // wallet address (lowercased)
  rating?: number
  downloads?: number
}

// ── Internal helpers ──────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('KV timeout')), ms)
    ),
  ])
}

function encodeKey(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function decodeValue(data: string): string {
  // value.data from KvClient is a base64 string; decode back to UTF-8
  return new TextDecoder().decode(
    Uint8Array.from(atob(data), c => c.charCodeAt(0))
  )
}

async function getSigner() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window === 'undefined' || !(window as any).ethereum)
    throw new Error('No injected wallet found. Connect a wallet first.')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new BrowserProvider((window as any).ethereum)
  return provider.getSigner()
}

// ── KV read ───────────────────────────────────────────────────────

async function fetchFromKv(): Promise<MarketListing[]> {
  const kv = new KvClient(KV_NODE_URL)

  const countVal = await kv.getValue(STREAM_ID, COUNT_KEY)
  if (!countVal) return []

  const count = parseInt(decodeValue(countVal.data), 10) || 0
  if (count === 0) return []

  const results: MarketListing[] = []
  for (let i = 0; i < count; i++) {
    const val = await kv.getValue(STREAM_ID, encodeKey(String(i)))
    if (!val) continue
    try {
      results.push(JSON.parse(decodeValue(val.data)) as MarketListing)
    } catch {
      // skip malformed entries
    }
  }
  return results.reverse() // newest first
}

// ── KV write ──────────────────────────────────────────────────────

async function publishToKv(listing: MarketListing): Promise<void> {
  const signer      = await getSigner()
  const kv          = new KvClient(KV_NODE_URL)
  const storageNode = new StorageNode(KV_NODE_URL)

  // Get the flow contract address directly from the node's network identity —
  // no hardcoded contract address needed; the node reports its own flow address.
  const status = await storageNode.getStatus()
  if (!status) throw new Error('Failed to get KV node status')
  const flow = FixedPriceFlow__factory.connect(
    status.networkIdentity.flowAddress,
    signer
  )

  // Read current count
  const countVal = await kv.getValue(STREAM_ID, COUNT_KEY)
  const count = countVal ? parseInt(decodeValue(countVal.data), 10) || 0 : 0

  // Build and submit both writes atomically in one batcher.exec() call
  const batcher = new Batcher(1, [storageNode], flow, EVM_RPC)
  batcher.streamDataBuilder.set(
    STREAM_ID,
    encodeKey(String(count)),
    new TextEncoder().encode(JSON.stringify(listing))
  )
  batcher.streamDataBuilder.set(
    STREAM_ID,
    COUNT_KEY,
    new TextEncoder().encode(String(count + 1))
  )

  const [, err] = await batcher.exec()
  if (err) throw err
}

// ── Public API ────────────────────────────────────────────────────

export async function fetchMarketListings(): Promise<MarketListing[]> {
  try {
    return await withTimeout(fetchFromKv(), KV_TIMEOUT_MS)
  } catch {
    const res = await fetch('/api/marketplace')
    if (!res.ok) throw new Error('Marketplace fetch failed on both 0G KV and Upstash')
    return res.json()
  }
}

export async function publishGymListing(listing: MarketListing): Promise<void> {
  try {
    await withTimeout(publishToKv(listing), KV_TIMEOUT_MS)
  } catch {
    // Upstash fallback via Next.js API route (keeps secrets server-side)
    const res = await fetch('/api/marketplace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listing),
    })
    if (!res.ok) throw new Error('Marketplace publish failed on both 0G KV and Upstash')
  }
}
