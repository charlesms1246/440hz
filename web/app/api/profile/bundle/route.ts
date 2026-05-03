import { NextRequest, NextResponse } from 'next/server'
import { Indexer } from '@0gfoundation/0g-ts-sdk'

const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai'

// ── GET /api/profile/bundle?hash=0x... ───────────────────────────────────────
// Fetches the full profile bundle from 0G Storage by root hash.
// No wallet required — downloads are public.
export async function GET(req: NextRequest) {
  const rootHash = req.nextUrl.searchParams.get('hash')
  if (!rootHash) return NextResponse.json({ error: 'hash required' }, { status: 400 })

  try {
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
