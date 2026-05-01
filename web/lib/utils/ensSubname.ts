'use client'

import { BrowserProvider, Contract } from 'ethers'
import { namehash } from 'viem'

// ── L2Registrar on Base Sepolia ───────────────────────────────────────────────
// Deployed by 440hz admin and approved via registry.addRegistrar().
// Set this after deploying contracts/contracts/L2Registrar.sol on Base Sepolia.
export const L2_REGISTRAR_ADDRESS = '0xFcCF01179c3e6AB33796a9D2804380D1C609b3bA'
export const BASE_SEPOLIA_CHAIN_ID = 84532

export const BASE_NODE = namehash('440hz.eth')

const REGISTRAR_ABI = [
  'function register(string calldata label, address subOwner) external returns (bytes32)',
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

// ── Main registration function ────────────────────────────────────────────────
// Requires the user's wallet to be on Base Sepolia (chainId 84532).
// Returns the full ENS name on success.
export async function registerSubname(
  label: string,
  type: SubnameType,
  ownerAddress: string,
): Promise<string> {
  if (L2_REGISTRAR_ADDRESS === '0x0000000000000000000000000000000000000000') {
    // Registrar not yet deployed — log and return the expected name without registering
    const ensName = buildEnsName(label, type)
    console.warn(`[ensSubname] Registrar not deployed yet. Would register: ${ensName}`)
    return ensName
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No injected wallet — connect a wallet first')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new BrowserProvider((window as any).ethereum)
  const network = await provider.getNetwork()

  if (Number(network.chainId) !== BASE_SEPOLIA_CHAIN_ID) {
    // Ask wallet to switch to Base Sepolia
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (window as any).ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${BASE_SEPOLIA_CHAIN_ID.toString(16)}` }],
    })
  }

  const signer = await provider.getSigner()
  const registrar = new Contract(L2_REGISTRAR_ADDRESS, REGISTRAR_ABI, signer)

  const slug = slugify(label)
  const fullLabel = `${slug}${SUFFIX[type]}`
  const tx = await registrar.register(fullLabel, ownerAddress)
  await tx.wait()

  return buildEnsName(label, type)
}
