'use client'

import { BrowserProvider, Contract, JsonRpcProvider, keccak256, toUtf8Bytes, getBytes } from 'ethers'

// ── Deployed addresses ────────────────────────────────────────────────────────
// Galileo (0G testnet, chainId 16602):
//   cd contracts && npx hardhat ignition deploy ignition/modules/Deploy440hz.ts --network galileo
// Base Sepolia (chainId 84532):
//   cd contracts && npx hardhat ignition deploy ignition/modules/DeployL2Registrar.ts --network baseSepolia
//   Then call registry.addRegistrar(<L2Registrar address>) from the registry owner wallet.
//   Finally set L2_REGISTRAR_ADDRESS in web/lib/utils/ensSubname.ts.
export const CONTRACT_ADDRESSES: Record<number, { GymMarketplace: string; TrainingEscrow: string }> = {
  16602: {
    GymMarketplace: '0xb3Df63Ac5Ec5648d2E764a7C579148F29858E99D',
    TrainingEscrow: '0x558298297E714312D5670dBe4dbc15E1D240a811',
  },
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

// Default compute provider on 0G Galileo testnet (from 0g_integration/.env.example)
export const DEFAULT_COMPUTE_PROVIDER = '0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C'

// ── rootHash → bytes32 key ────────────────────────────────────────────────────
// 0G rootHashes are 66-char hex strings (0x + 64 hex = 32 bytes).
// We hash those raw bytes to get a deterministic bytes32 mapping key.
// For non-hex roots (IPFS CIDs etc.) we fall back to UTF-8 encoding.
export function getRootHashKey(rootHash: string): string {
  try {
    if (rootHash.startsWith('0x') && rootHash.length === 66) {
      return keccak256(getBytes(rootHash))
    }
  } catch { /* ignore invalid hex */ }
  return keccak256(toUtf8Bytes(rootHash))
}

export function getJobIdKey(taskId: string): string {
  return keccak256(toUtf8Bytes(taskId))
}

// ── Human-readable ABI fragments ─────────────────────────────────────────────

const MARKETPLACE_ABI = [
  'function listGym(bytes32 rootHashKey, string name, string category, string license, uint256 priceWei)',
  'function purchaseGym(bytes32 rootHashKey) payable',
  'function checkAccess(address buyer, bytes32 rootHashKey) view returns (bool)',
  'function getListing(bytes32 rootHashKey) view returns (tuple(address seller, uint256 priceWei, string name, string category, string license, bool active))',
  'function getListingCount() view returns (uint256)',
  'function pendingRoyalties(address builder) view returns (uint256)',
  'function claimRoyalties()',
  'error AlreadyListed()',
  'error AlreadyOwned()',
  'error ListingNotActive()',
  'error InsufficientPayment()',
  'error NothingToClaim()',
]

const ESCROW_ABI = [
  'function estimateCost(uint32 numEpisodes, uint8 loraRank) pure returns (uint256)',
  'function depositJob(bytes32 jobId, address provider, bytes32 gymRootHashKey) payable',
  'error JobAlreadyExists()',
  'error DepositRequired()',
  'error InvalidProvider()',
]

// ── Internal helpers ──────────────────────────────────────────────────────────

function readProvider() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new BrowserProvider((window as any).ethereum)
  }
  return new JsonRpcProvider('https://evmrpc-testnet.0g.ai')
}

async function getSigner() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window === 'undefined' || !(window as any).ethereum)
    throw new Error('No injected wallet — connect a wallet first')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new BrowserProvider((window as any).ethereum)
  return provider.getSigner()
}

function isDeployed(chainId: number) {
  const addrs = CONTRACT_ADDRESSES[chainId]
  return addrs && addrs.GymMarketplace !== ZERO_ADDR
}

// ── GymMarketplace — writes ───────────────────────────────────────────────────

export async function contractListGym(
  rootHash: string,
  name: string,
  category: string,
  license: string,
  priceWei: bigint,
): Promise<void> {
  if (!isDeployed(16602)) throw new Error('GymMarketplace not deployed — run ignition deploy first')
  const signer = await getSigner()
  const contract = new Contract(CONTRACT_ADDRESSES[16602].GymMarketplace, MARKETPLACE_ABI, signer)
  const tx = await contract.listGym(getRootHashKey(rootHash), name, category, license, priceWei)
  await tx.wait()
}

export async function contractPurchaseGym(rootHash: string, priceWei: bigint): Promise<void> {
  if (!isDeployed(16602)) throw new Error('GymMarketplace not deployed — run ignition deploy first')
  const signer = await getSigner()
  const contract = new Contract(CONTRACT_ADDRESSES[16602].GymMarketplace, MARKETPLACE_ABI, signer)
  const tx = await contract.purchaseGym(getRootHashKey(rootHash), { value: priceWei })
  await tx.wait()
}

export async function contractClaimRoyalties(): Promise<void> {
  if (!isDeployed(16602)) throw new Error('GymMarketplace not deployed — run ignition deploy first')
  const signer = await getSigner()
  const contract = new Contract(CONTRACT_ADDRESSES[16602].GymMarketplace, MARKETPLACE_ABI, signer)
  const tx = await contract.claimRoyalties()
  await tx.wait()
}

// ── GymMarketplace — reads ────────────────────────────────────────────────────

export async function contractCheckAccess(rootHash: string, buyer: string): Promise<boolean> {
  if (!isDeployed(16602)) return false
  const contract = new Contract(CONTRACT_ADDRESSES[16602].GymMarketplace, MARKETPLACE_ABI, readProvider())
  return contract.checkAccess(buyer, getRootHashKey(rootHash))
}

export async function contractPendingRoyalties(builder: string): Promise<bigint> {
  if (!isDeployed(16602)) return 0n
  const contract = new Contract(CONTRACT_ADDRESSES[16602].GymMarketplace, MARKETPLACE_ABI, readProvider())
  return contract.pendingRoyalties(builder)
}

// ── TrainingEscrow ────────────────────────────────────────────────────────────

export async function contractEstimateCost(numEpisodes: number, loraRank: number): Promise<bigint> {
  if (!isDeployed(16602)) return 0n
  const contract = new Contract(CONTRACT_ADDRESSES[16602].TrainingEscrow, ESCROW_ABI, readProvider())
  return contract.estimateCost(numEpisodes, loraRank)
}

export async function contractDepositJob(
  taskId: string,
  provider: string,
  gymRootHash: string,
  value: bigint,
): Promise<string> {
  if (!isDeployed(16602)) throw new Error('TrainingEscrow not deployed — run ignition deploy first')
  const signer = await getSigner()
  const contract = new Contract(CONTRACT_ADDRESSES[16602].TrainingEscrow, ESCROW_ABI, signer)
  const tx = await contract.depositJob(getJobIdKey(taskId), provider, getRootHashKey(gymRootHash), { value })
  await tx.wait()
  return tx.hash as string
}
