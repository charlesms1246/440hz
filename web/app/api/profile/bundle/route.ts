import { NextRequest, NextResponse } from 'next/server'
import { Indexer, StorageNode } from '@0gfoundation/0g-ts-sdk'

const KV_NODE_URL = process.env.NEXT_PUBLIC_0G_KV_NODE_URL ?? 'http://178.238.236.119:6789'
const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai'

// ── GET /api/profile/bundle?sequence=N ────────────────────────────────────────
// Lazily fetches the full profile bundle from 0G Storage by txSeq.
// No wallet required — downloads are public.
export async function GET(req: NextRequest) {
  const seqParam = req.nextUrl.searchParams.get('sequence')
  if (!seqParam) return NextResponse.json({ error: 'sequence required' }, { status: 400 })

  const txSeq = parseInt(seqParam, 10)
  if (isNaN(txSeq) || txSeq <= 0) {
    return NextResponse.json({ error: 'invalid sequence' }, { status: 400 })
  }

  try {
    // Resolve txSeq → rootHash via the storage node
    const storageNode = new StorageNode(KV_NODE_URL)
    const fileInfo = await storageNode.getFileInfoByTxSeq(txSeq)
    if (!fileInfo) return NextResponse.json({ error: 'file not found' }, { status: 404 })

    const rootHash: string = fileInfo.tx.dataRoot

    // Download full profile bundle
    const indexer = new Indexer(INDEXER_URL)
    const [blob, err] = await indexer.downloadToBlob(rootHash)
    if (err) throw err

    const text = await (blob as Blob).text()
    return NextResponse.json(JSON.parse(text))
  } catch (err) {
    console.error('[profile/bundle] fetch failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
