'use client'

import { BrowserProvider, Contract } from 'ethers'
import { namehash } from 'viem'

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
]

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
  if (L2_REGISTRAR_ADDRESS === '0x0000000000000000000000000000000000000000') {
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

// ── Set ENS avatar text record via Durin L2Registry ──────────────────────────
// Stores the 0G Storage rootHash as 'com.440hz.avatar' on the subname node.
export async function setEnsAvatarRecord(
  label: string,
  type: SubnameType,
  rootHash: string,
): Promise<void> {
  const signer = await getBaseSepolia()
  const registry = new Contract(L2_REGISTRY_ADDRESS, REGISTRY_ABI, signer)

  const node = namehash(buildEnsName(label, type))
  const tx = await registry.setText(node, 'com.440hz.avatar', rootHash)
  await tx.wait()
}
