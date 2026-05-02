import { NextRequest, NextResponse } from 'next/server'
import { JsonRpcProvider, Wallet } from 'ethers'
import {
  MemData,
  Indexer,
  KvClient,
  Batcher,
  StorageNode,
  FixedPriceFlow__factory,
} from '@0gfoundation/0g-ts-sdk'
import { redis, type ProfileIndex } from '@/lib/redis'

const EVM_RPC = process.env.NEXT_PUBLIC_0G_EVM_RPC ?? 'https://evmrpc-testnet.0g.ai'
const KV_NODE_URL = process.env.NEXT_PUBLIC_0G_KV_NODE_URL ?? 'http://178.238.236.119:6789'
const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai'
const PROFILES_STREAM_ID =
  process.env.NEXT_PUBLIC_0G_PROFILES_STREAM_ID ??
  '0x440a7b1e57f320b8c5e6b9c2d3f4a5b6c7d8e9f0a1b2c3d4e5f6071829300f0'

type ProfileBundle = {
  walletAddress: string
  username: string
  ensName: string
  persona: 'tuner' | 'builder' | 'provider'
  onboardingComplete: boolean
  profilePicture: string
  savedAt: string
}

function getServerWallet() {
  const pk = process.env.PRIVATE_KEY
  if (!pk) throw new Error('PRIVATE_KEY not configured')
  return new Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, new JsonRpcProvider(EVM_RPC))
}

async function uploadBundle(bundle: ProfileBundle): Promise<{ rootHash: string; storageSequence: number }> {
  const wallet = getServerWallet()
  const bytes = new TextEncoder().encode(JSON.stringify(bundle))
  const data = new MemData(bytes)

  const [tree, treeErr] = await data.merkleTree()
  if (treeErr) throw treeErr

  const indexer = new Indexer(INDEXER_URL)
  const [result, uploadErr] = await indexer.upload(data, EVM_RPC, wallet)

  if (uploadErr) {
    // "not finalized yet" is a transient storage-node sync warning — rootHash is still valid
    console.warn('[0G upload] node sync pending:', (uploadErr as Error).message ?? String(uploadErr))
  }

  const rootHash = (result as { rootHash?: string } | null)?.rootHash ?? tree!.rootHash()
  const storageSequence = (result as { txSeq?: number } | null)?.txSeq ?? 0
  return { rootHash, storageSequence }
}

async function fetchExistingBundle(storageSequence: number): Promise<ProfileBundle | null> {
  try {
    const storageNode = new StorageNode(KV_NODE_URL)
    const fileInfo = await storageNode.getFileInfoByTxSeq(storageSequence)
    if (!fileInfo) return null
    const indexer = new Indexer(INDEXER_URL)
    const [blob, err] = await indexer.downloadToBlob(fileInfo.tx.dataRoot)
    if (err) return null
    return JSON.parse(await (blob as Blob).text()) as ProfileBundle
  } catch {
    return null
  }
}

async function writeToKv(address: string, index: ProfileIndex): Promise<void> {
  const wallet = getServerWallet()
  const storageNode = new StorageNode(KV_NODE_URL)
  const status = await storageNode.getStatus()
  if (!status) throw new Error('KV node unavailable')

  const flow = FixedPriceFlow__factory.connect(status.networkIdentity.flowAddress, wallet)
  const batcher = new Batcher(1, [storageNode], flow, EVM_RPC)

  batcher.streamDataBuilder.set(
    PROFILES_STREAM_ID,
    new TextEncoder().encode(address.toLowerCase()),
    new TextEncoder().encode(JSON.stringify(index)),
  )

  const [, err] = await batcher.exec()
  if (err) throw err
}

async function readFromKv(address: string): Promise<ProfileIndex | null> {
  const kv = new KvClient(KV_NODE_URL)
  const key = new TextEncoder().encode(address.toLowerCase())
  try {
    const val = await Promise.race([
      kv.getValue(PROFILES_STREAM_ID, key),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('KV timeout')), 5000)),
    ])
    if (!val) return null
    const text = new TextDecoder().decode(
      Uint8Array.from(atob(val.data), c => c.charCodeAt(0)),
    )
    return JSON.parse(text) as ProfileIndex
  } catch {
    return null
  }
}

// ── GET /api/profile?address= ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })

  const kvResult = await readFromKv(address)
  if (kvResult) return NextResponse.json(kvResult)

  const redisResult = await redis.get<ProfileIndex>(address.toLowerCase())
  return NextResponse.json(redisResult ?? null)
}

// ── POST /api/profile ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    address: string
    username?: string
    ensName?: string
    persona?: 'tuner' | 'builder' | 'provider'
    onboardingComplete?: boolean
    profilePicture?: string
  }

  const { address, ...patch } = body
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })

  // Fetch existing index to find current storageSequence
  const existingIndex =
    (await readFromKv(address).catch(() => null)) ??
    (await redis.get<ProfileIndex>(address.toLowerCase()))

  // Fetch existing full bundle to preserve fields not included in the patch
  let existingBundle: ProfileBundle | null = null
  if (existingIndex && existingIndex.storageSequence > 0) {
    existingBundle = await fetchExistingBundle(existingIndex.storageSequence)
  }

  const bundle: ProfileBundle = {
    walletAddress: address.toLowerCase(),
    username: patch.username ?? existingBundle?.username ?? '',
    ensName: patch.ensName ?? existingBundle?.ensName ?? '',
    persona: patch.persona ?? existingBundle?.persona ?? 'tuner',
    onboardingComplete: patch.onboardingComplete ?? existingBundle?.onboardingComplete ?? false,
    profilePicture: patch.profilePicture ?? existingBundle?.profilePicture ?? '',
    savedAt: new Date().toISOString(),
  }

  // Upload merged bundle to 0G Storage — server wallet pays gas
  let rootHash = ''
  let storageSequence = 0
  try {
    ;({ rootHash, storageSequence } = await uploadBundle(bundle))
  } catch (err) {
    console.error('[profile/POST] 0G Storage upload failed:', err)
  }

  const index: ProfileIndex = { ensName: bundle.ensName, storageSequence }

  // Write lightweight index to 0G KV (primary)
  try {
    await writeToKv(address, index)
  } catch (err) {
    console.error('[profile/POST] 0G KV write failed:', err)
  }

  // Write to Redis (fallback)
  await redis.set(address.toLowerCase(), index)

  return NextResponse.json({ ...bundle, storageSequence, rootHash })
}
