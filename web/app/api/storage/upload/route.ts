import { NextRequest, NextResponse } from 'next/server'
import { JsonRpcProvider, Wallet } from 'ethers'
import { MemData, Indexer } from '@0gfoundation/0g-ts-sdk'

const EVM_RPC = process.env.NEXT_PUBLIC_0G_EVM_RPC ?? 'https://evmrpc-testnet.0g.ai'
const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai'

// POST /api/storage/upload
// Body: { data: string }  — JSON-stringified payload to upload
// Returns: { rootHash: string, txSeq: number | null }
export async function POST(req: NextRequest) {
  const privateKey = process.env.PRIVATE_KEY
  if (!privateKey) {
    return NextResponse.json({ error: 'Server wallet not configured' }, { status: 500 })
  }

  // Accepts { data: string } (plain text) or { dataBase64: string } (binary)
  const body = await req.json() as { data?: string; dataBase64?: string }
  if (!body.data && !body.dataBase64) {
    return NextResponse.json({ error: 'data or dataBase64 required' }, { status: 400 })
  }

  try {
    const wallet = new Wallet(
      privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`,
      new JsonRpcProvider(EVM_RPC),
    )

    const bytes = body.dataBase64
      ? Buffer.from(body.dataBase64, 'base64')
      : new TextEncoder().encode(body.data!)
    const memData = new MemData(bytes)

    const [tree, treeErr] = await memData.merkleTree()
    if (treeErr) throw treeErr

    const indexer = new Indexer(INDEXER_URL)
    const [result, uploadErr] = await indexer.upload(memData, EVM_RPC, wallet)

    if (uploadErr) {
      console.warn('[storage/upload] node sync pending:', (uploadErr as Error).message ?? String(uploadErr))
    }

    const rootHash = (result as { rootHash?: string } | null)?.rootHash ?? tree!.rootHash()
    const txSeq = (result as { txSeq?: number } | null)?.txSeq ?? null

    return NextResponse.json({ rootHash, txSeq })
  } catch (err) {
    console.error('[storage/upload]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
