'use client'

import { BrowserProvider, JsonRpcProvider, Contract } from 'ethers'
import { namehash } from 'viem'
import type { VersionManifest } from '@/lib/gymStore'
import { downloadVersionManifest } from '@/lib/utils/upload0g'

// ── L2Registrar on Base Sepolia ───────────────────────────────────────────────
export const L2_REGISTRAR_ADDRESS = '0xFcCF01179c3e6AB33796a9D2804380D1C609b3bA'
export const L2_REGISTRY_ADDRESS = '0xbe9dfa62bba91781c204bd6b1b2e6513924f50a2'
export const BASE_SEPOLIA_CHAIN_ID = 84532

export const BASE_NODE = namehash('440hz.eth')

const REGISTRAR_ABI = [
  'function register(string calldata label, address subOwner) external returns (bytes32)',
]

const REGISTRY_ABI = [
  'function setText(bytes32 node, string key, string value) external',
  'function text(bytes32 node, string key) view returns (string)',
]

// Base Sepolia public RPC — used for read-only calls (no wallet switch needed)
const BASE_SEPOLIA_RPC = 'https://sepolia.base.org'

// ── Subname type → label suffix ───────────────────────────────────────────────
const SUFFIX: Record<SubnameType, string> = {
  user: '',
  gym: '-gym',
  model: '-model',
  weights: '-weights',
}

export type SubnameType = 'user' | 'gym' | 'model' | 'weights'

// ── Slug helper ───────────────────────────────────────────────────────────────
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ── Build the full ENS name ───────────────────────────────────────────────────
export function buildEnsName(label: string, type: SubnameType): string {
  const slug = slugify(label)
  return `${slug}${SUFFIX[type]}.440hz.eth`
}

// ── Ensure wallet is on Base Sepolia and return a fresh provider + signer ─────
async function getBaseSepolia() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No injected wallet — connect a wallet first')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eth = (window as any).ethereum
  let provider = new BrowserProvider(eth)
  const network = await provider.getNetwork()

  if (Number(network.chainId) !== BASE_SEPOLIA_CHAIN_ID) {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${BASE_SEPOLIA_CHAIN_ID.toString(16)}` }],
    })
    // Re-create provider so it reflects the new chain
    provider = new BrowserProvider(eth)
  }

  const signer = await provider.getSigner()
  return signer
}

// ── Main registration function ────────────────────────────────────────────────
export async function registerSubname(
  label: string,
  type: SubnameType,
  ownerAddress: string,
): Promise<string> {
  if ((L2_REGISTRAR_ADDRESS as string) === '0x0000000000000000000000000000000000000000') {
    const ensName = buildEnsName(label, type)
    console.warn(`[ensSubname] Registrar not deployed yet. Would register: ${ensName}`)
    return ensName
  }

  const signer = await getBaseSepolia()
  const registrar = new Contract(L2_REGISTRAR_ADDRESS, REGISTRAR_ABI, signer)

  const slug = slugify(label)
  const fullLabel = `${slug}${SUFFIX[type]}`
  const tx = await registrar.register(fullLabel, ownerAddress)
  await tx.wait()

  return buildEnsName(label, type)
}

// ── General ENS text record setter ───────────────────────────────────────────
export async function setEnsTextRecord(
  label: string,
  type: SubnameType,
  key: string,
  value: string,
): Promise<void> {
  const signer = await getBaseSepolia()
  const registry = new Contract(L2_REGISTRY_ADDRESS, REGISTRY_ABI, signer)

  const node = namehash(buildEnsName(label, type))
  const tx = await registry.setText(node, key, value)
  await tx.wait()
}

// ── Read an ENS text record (read-only, no wallet required) ──────────────────
export async function readEnsTextRecord(
  ensName: string,  // full name e.g. 'foo-gym.440hz.eth'
  key: string,
): Promise<string> {
  const provider = new JsonRpcProvider(BASE_SEPOLIA_RPC)
  const registry = new Contract(L2_REGISTRY_ADDRESS, REGISTRY_ABI, provider)
  const node = namehash(ensName)
  return (await registry.text(node, key)) as string
}

// ── Resolve a gym ENS name to its current rootHash via version manifest ───────
export async function resolveGymEns(gymEnsName: string): Promise<{
  manifestHash: string | null
  currentRootHash: string | null
  manifest: VersionManifest | null
}> {
  try {
    const manifestHash = await readEnsTextRecord(gymEnsName, 'com.440hz.versions')
    if (!manifestHash) return { manifestHash: null, currentRootHash: null, manifest: null }
    const manifest = await downloadVersionManifest(manifestHash)
    return { manifestHash, currentRootHash: manifest.current, manifest }
  } catch {
    return { manifestHash: null, currentRootHash: null, manifest: null }
  }
}

// ── Enumerate all registered subnames via L2Registrar events ─────────────────

const REGISTRAR_EVENT_ABI = [
  'event SubnameRegistered(string label, address indexed registrant, bytes32 node)',
]

export type SubnameRecord = {
  label: string        // raw label e.g. 'grevin', 'my-gym-gym', 'run1-weights'
  ensName: string      // full name e.g. 'my-gym-gym.440hz.eth'
  type: SubnameType
  displayName: string  // human-readable e.g. 'My Gym'
  registrant: string   // wallet address
  blockNumber: number
}

function labelToType(label: string): SubnameType {
  if (label.endsWith('-gym')) return 'gym'
  if (label.endsWith('-model')) return 'model'
  if (label.endsWith('-weights')) return 'weights'
  return 'user'
}

function labelToDisplayName(label: string, type: SubnameType): string {
  const stripped = type === 'user' ? label
    : label.slice(0, label.lastIndexOf(`-${type}`))
  return stripped.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Block at which L2Registrar was deployed on Base Sepolia
const L2_REGISTRAR_DEPLOY_BLOCK = 40_944_763
// Base Sepolia RPC limits eth_getLogs to 10,000 blocks per request
const LOG_CHUNK = 9_000

export async function fetchAllSubnames(): Promise<SubnameRecord[]> {
  const provider = new JsonRpcProvider(BASE_SEPOLIA_RPC)
  const contract = new Contract(L2_REGISTRAR_ADDRESS, REGISTRAR_EVENT_ABI, provider)
  const latestBlock = await provider.getBlockNumber()

  // Build chunk ranges from deploy block to latest
  const ranges: Array<[number, number]> = []
  for (let from = L2_REGISTRAR_DEPLOY_BLOCK; from <= latestBlock; from += LOG_CHUNK) {
    ranges.push([from, Math.min(from + LOG_CHUNK - 1, latestBlock)])
  }

  // Fetch all chunks in parallel (Base Sepolia handles concurrent requests fine)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chunks = await Promise.all(
    ranges.map(([from, to]) =>
      contract.queryFilter(contract.filters.SubnameRegistered(), from, to) as Promise<any[]>
    )
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return chunks.flat().map((e: any) => {
    const label: string      = e.args.label      ?? e.args[0]
    const registrant: string = e.args.registrant ?? e.args[1]
    const type = labelToType(label)
    return {
      label,
      ensName: `${label}.440hz.eth`,
      type,
      displayName: labelToDisplayName(label, type),
      registrant,
      blockNumber: e.blockNumber as number,
    }
  })
}

// ── Set ENS avatar text record via Durin L2Registry ──────────────────────────
// Stores the 0G Storage rootHash as 'com.440hz.avatar' on the subname node.
export async function setEnsAvatarRecord(
  label: string,
  type: SubnameType,
  rootHash: string,
): Promise<void> {
  return setEnsTextRecord(label, type, 'com.440hz.avatar', rootHash)
}
