import { NextRequest, NextResponse } from 'next/server'
import { JsonRpcProvider, Wallet, Contract } from 'ethers'
import { namehash } from 'viem'

const BASE_SEPOLIA_RPC = 'https://sepolia.base.org'
const L2_REGISTRY_ADDRESS = '0xbe9dfa62bba91781c204bd6b1b2e6513924f50a2'

const REGISTRY_ABI = [
  'function setText(bytes32 node, string key, string value) external',
]

// POST /api/ens/text  { ensName, key, value }
export async function POST(req: NextRequest) {
  const { ensName, key, value } = await req.json() as { ensName: string; key: string; value: string }

  if (!ensName || !key || value === undefined) {
    return NextResponse.json({ error: 'ensName, key, and value required' }, { status: 400 })
  }

  const privateKey = process.env.PRIVATE_KEY
  if (!privateKey) {
    return NextResponse.json({ error: 'Server wallet not configured' }, { status: 500 })
  }

  const provider = new JsonRpcProvider(BASE_SEPOLIA_RPC)
  const serverWallet = new Wallet(`0x${privateKey}`.replace(/^0x0x/, '0x'), provider)
  const registry = new Contract(L2_REGISTRY_ADDRESS, REGISTRY_ABI, serverWallet)

  const node = namehash(ensName) as `0x${string}`

  try {
    const tx = await registry.setText(node, key, value)
    await tx.wait()
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `setText failed: ${msg}` }, { status: 500 })
  }
}
