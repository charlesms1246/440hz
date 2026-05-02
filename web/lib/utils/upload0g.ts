'use client'

import { MemData, Indexer } from '@0gfoundation/0g-ts-sdk'
import { BrowserProvider } from 'ethers'
import type { VersionManifest } from '@/lib/gymStore'

const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai'
const EVM_RPC = 'https://evmrpc-testnet.0g.ai'

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

// ── Internal: get signer from injected wallet ─────────────────────

async function getSigner() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No injected wallet found. Connect MetaMask or Rabby first.')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new BrowserProvider((window as any).ethereum)
  return provider.getSigner()
}

// ── Internal: upload bytes → root hash ───────────────────────────

async function uploadBytes(bytes: Uint8Array): Promise<string> {
  const signer = await getSigner()
  const data = new MemData(bytes)

  const [tree, treeErr] = await data.merkleTree()
  if (treeErr != null) throw treeErr

  const indexer = new Indexer(INDEXER_URL)
  const [result, uploadErr] = await indexer.upload(data, EVM_RPC, signer)
  if (uploadErr != null) throw uploadErr

  return (result as { rootHash: string }).rootHash ?? tree!.rootHash()
}

// ── Public: upload Python code string (legacy, used by Compile) ──

/**
 * Uploads a Python gym file to 0G Testnet Storage.
 * @returns Merkle root hash
 */
export async function uploadGymToStorage(code: string): Promise<string> {
  return uploadBytes(new TextEncoder().encode(code))
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

// ── Public: upload full gym bundle ───────────────────────────────
//
// Wire format: JSON with file contents base64-encoded.
// In memory (GymBundle type) files are always plain strings.

export async function uploadGymBundle(bundle: GymBundle): Promise<string> {
  const wire = { ...bundle, files: encodeFiles(bundle.files) }
  return uploadBytes(new TextEncoder().encode(JSON.stringify(wire)))
}

// ── Public: SHA-256 fingerprint of wire bytes (no wallet needed) ─
// Used for change detection: if hash matches the last saved contentHash,
// skip the upload entirely.

export async function computeBundleHash(bundle: GymBundle): Promise<string> {
  const wire = { ...bundle, files: encodeFiles(bundle.files) }
  const bytes = new TextEncoder().encode(JSON.stringify(wire))
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Public: upload version manifest JSON to 0G Storage ──────────

export async function uploadVersionManifest(manifest: VersionManifest): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(manifest))
  return uploadBytes(bytes)
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

// ── Public: upload profile picture (base64 data URL) ─────────────

/**
 * Uploads a profile picture to 0G Testnet Storage.
 * @param dataUrl base64 data URL (e.g. from FileReader.readAsDataURL)
 * @returns Merkle root hash
 */
export async function uploadProfilePicture(dataUrl: string): Promise<string> {
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new Error('Invalid data URL')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return uploadBytes(bytes)
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
