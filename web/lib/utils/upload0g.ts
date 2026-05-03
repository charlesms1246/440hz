'use client'

import { MemData, Indexer } from '@0gfoundation/0g-ts-sdk'
import { BrowserProvider, JsonRpcSigner } from 'ethers'
import { switchChain } from '@wagmi/core'
import { wagmiConfig, zeroGGalileo } from '@/lib/wagmi'
import type { VersionManifest } from '@/lib/gymStore'

const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai'
const EVM_RPC =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_0G_EVM_RPC) ||
  'https://evmrpc-testnet.0g.ai'

// ── Types ─────────────────────────────────────────────────────────

export type ChatEntry = { role: 'user' | 'assistant'; content: string }

export type GymBundle = {
  version: '1.0'
  projectName: string
  savedAt: string
  graph: {
    nodes: unknown[]
    edges: unknown[]
  }
  files: Record<string, string>
  chat?: ChatEntry[]
}

// ── User-wallet upload (0G Galileo) ──────────────────────────────
// Used for gym bundles, version manifests, and gym source code.
// The user's wallet on 0G Galileo pays gas — no chain switch needed
// as long as the wallet is already on 0G Galileo.

async function uploadBytesAsUser(bytes: Uint8Array): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eth = typeof window !== 'undefined' && (window as any).ethereum
  if (!eth) throw new Error('No injected wallet found. Connect MetaMask or Rabby first.')

  // Switch to 0G Galileo — try wagmi first, fall back to direct wallet RPC
  // if the wagmi connector isn't ready (e.g., reconnecting after page refresh)
  try {
    await switchChain(wagmiConfig, { chainId: zeroGGalileo.id })
  } catch {
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${zeroGGalileo.id.toString(16)}` }],
      })
    } catch (switchErr) {
      if ((switchErr as { code?: number })?.code !== 4902) throw switchErr
    }
  }

  // eth_accounts returns already-connected accounts silently (no picker, no eth_requestAccounts)
  const accounts: string[] = await eth.request({ method: 'eth_accounts' })
  if (!accounts?.length) throw new Error('Connect your wallet first.')

  // Construct signer directly from known address — skips the eth_requestAccounts call
  // that getSigner() would trigger, avoiding the wallet provider selection popup
  const provider = new BrowserProvider(eth, zeroGGalileo.id)
  const signer = new JsonRpcSigner(provider, accounts[0])

  const data = new MemData(bytes)
  const [tree, treeErr] = await data.merkleTree()
  if (treeErr != null) throw treeErr

  const indexer = new Indexer(INDEXER_URL)
  const [result, uploadErr] = await indexer.upload(data, EVM_RPC, signer)
  if (uploadErr != null) throw uploadErr

  return (result as { rootHash?: string } | null)?.rootHash ?? tree!.rootHash()
}

// ── Server-wallet upload ──────────────────────────────────────────
// Used for profile pictures (onboarding). Server pays gas — no
// wallet prompt and no chain-switch required for the user.

async function uploadBytesAsServer(bytes: Uint8Array): Promise<string> {
  const dataBase64 = btoa(String.fromCharCode(...bytes))
  const res = await fetch('/api/storage/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataBase64 }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? 'Upload failed')
  }
  const { rootHash } = await res.json()
  return rootHash
}

// ── Internal: base64 encode/decode for file contents (Unicode-safe) ─

function encodeFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, content] of Object.entries(files)) {
    const bytes = new TextEncoder().encode(content)
    let binary = ''
    bytes.forEach(b => (binary += String.fromCharCode(b)))
    out[name] = btoa(binary)
  }
  return out
}

function decodeFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, encoded] of Object.entries(files)) {
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    out[name] = new TextDecoder().decode(bytes)
  }
  return out
}

// ── Public: upload gym bundle (user wallet) ───────────────────────

export async function uploadGymBundle(bundle: GymBundle): Promise<string> {
  const wire = { ...bundle, files: encodeFiles(bundle.files) }
  return uploadBytesAsUser(new TextEncoder().encode(JSON.stringify(wire)))
}

// ── Public: upload Python code string — legacy (user wallet) ─────

export async function uploadGymToStorage(code: string): Promise<string> {
  return uploadBytesAsUser(new TextEncoder().encode(code))
}

// ── Public: SHA-256 fingerprint of wire bytes (no wallet needed) ─

export async function computeBundleHash(bundle: GymBundle): Promise<string> {
  const wire = { ...bundle, files: encodeFiles(bundle.files) }
  const bytes = new TextEncoder().encode(JSON.stringify(wire))
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Public: upload version manifest (user wallet) ─────────────────

export async function uploadVersionManifest(manifest: VersionManifest): Promise<string> {
  return uploadBytesAsUser(new TextEncoder().encode(JSON.stringify(manifest)))
}

// ── Public: upload profile picture (server wallet) ────────────────
// Called from onboarding and settings — server pays gas, no chain prompt.

export async function uploadProfilePicture(dataUrl: string): Promise<string> {
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new Error('Invalid data URL')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return uploadBytesAsServer(bytes)
}

// ── Public: download version manifest by root hash ───────────────

export async function downloadVersionManifest(rootHash: string): Promise<VersionManifest> {
  const indexer = new Indexer(INDEXER_URL)
  const [blob, err] = await indexer.downloadToBlob(rootHash)
  if (err) throw new Error(`0G download failed: ${err}`)

  const text = await blob.text()
  const parsed = JSON.parse(text) as VersionManifest

  if (parsed.schemaVersion !== '1' || !Array.isArray(parsed.versions)) {
    throw new Error('Downloaded data is not a valid 440hz version manifest')
  }

  return parsed
}

// ── Public: download gym bundle by root hash ─────────────────────

export async function downloadGymBundle(rootHash: string): Promise<GymBundle> {
  const indexer = new Indexer(INDEXER_URL)
  const [blob, err] = await indexer.downloadToBlob(rootHash)
  if (err) throw new Error(`0G download failed: ${err}`)

  const text = await blob.text()
  const parsed = JSON.parse(text) as GymBundle & { files: Record<string, string> }

  if (parsed.version !== '1.0' || !parsed.graph || !parsed.files) {
    throw new Error('Downloaded data is not a valid 440hz gym bundle')
  }

  return { ...parsed, files: decodeFiles(parsed.files) }
}
