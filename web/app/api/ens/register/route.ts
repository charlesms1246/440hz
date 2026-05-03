import { NextRequest, NextResponse } from 'next/server'
import { JsonRpcProvider, Wallet, Contract } from 'ethers'
import { namehash } from 'viem'

const BASE_SEPOLIA_RPC = 'https://sepolia.base.org'
const L2_REGISTRAR_ADDRESS = '0xFcCF01179c3e6AB33796a9D2804380D1C609b3bA'
const L2_REGISTRY_ADDRESS = '0xbe9dfa62bba91781c204bd6b1b2e6513924f50a2'

const REGISTRAR_ABI = [
  'function register(string calldata label, address subOwner) external returns (bytes32)',
]

const REGISTRY_ABI = [
  'function owner(bytes32 node) external view returns (address)',
  'function setText(bytes32 node, string key, string value) external',
]

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildEnsName(slug: string): string {
  return `${slug}.440hz.eth`
}

export async function POST(req: NextRequest) {
  const { username, ownerAddress, rootHash } = await req.json() as { username: string; ownerAddress: string; rootHash?: string }

  if (!username || !ownerAddress) {
    return NextResponse.json({ error: 'username and ownerAddress required' }, { status: 400 })
  }

  const privateKey = process.env.PRIVATE_KEY
  if (!privateKey) {
    return NextResponse.json({ error: 'Server wallet not configured' }, { status: 500 })
  }

  const slug = slugify(username)
  if (!slug) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 })
  }

  const ensName = buildEnsName(slug)
  const node = namehash(ensName) as `0x${string}`

  const provider = new JsonRpcProvider(BASE_SEPOLIA_RPC)
  const registry = new Contract(L2_REGISTRY_ADDRESS, REGISTRY_ABI, provider)

  // Check if the subname is already owned by this address
  try {
    const currentOwner: string = await registry.owner(node)
    if (currentOwner.toLowerCase() === ownerAddress.toLowerCase()) {
      return NextResponse.json({ ensName, alreadyRegistered: true })
    }
    if (currentOwner !== '0x0000000000000000000000000000000000000000') {
      return NextResponse.json({ error: 'Name already taken by another address' }, { status: 409 })
    }
  } catch {
    // Registry may revert for unregistered nodes — treat as available
  }

  // Register using the server wallet (user pays no gas)
  const serverWallet = new Wallet(`0x${privateKey}`.replace(/^0x0x/, '0x'), provider)
  const registrar = new Contract(L2_REGISTRAR_ADDRESS, REGISTRAR_ABI, serverWallet)

  try {
    const tx = await registrar.register(slug, ownerAddress)
    await tx.wait()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Treat "already registered" contract reverts as success
    if (msg.includes('AlreadyRegistered') || msg.includes('already')) {
      // Still try to write rootHash text record even when already registered
      if (rootHash) {
        const registryWrite = new Contract(L2_REGISTRY_ADDRESS, REGISTRY_ABI, serverWallet)
        try {
          const rtx = await registryWrite.setText(node, 'com.440hz.rootHash', rootHash)
          await rtx.wait()
        } catch { /* best-effort */ }
      }
      return NextResponse.json({ ensName, alreadyRegistered: true })
    }
    return NextResponse.json({ error: `Registration failed: ${msg}` }, { status: 500 })
  }

  // Write rootHash as ENS text record so the gym is discoverable without a version manifest
  if (rootHash) {
    const registryWrite = new Contract(L2_REGISTRY_ADDRESS, REGISTRY_ABI, serverWallet)
    try {
      const rtx = await registryWrite.setText(node, 'com.440hz.rootHash', rootHash)
      await rtx.wait()
    } catch { /* best-effort — download will still work once manifest is set */ }
  }

  return NextResponse.json({ ensName, alreadyRegistered: false })
}
