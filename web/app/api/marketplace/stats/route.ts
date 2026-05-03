import { NextRequest, NextResponse } from 'next/server'

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

async function upstash(cmd: unknown[]) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) throw new Error('Upstash env vars not configured')
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  })
  return res.json()
}

async function upstashPipeline(cmds: unknown[][]) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) throw new Error('Upstash env vars not configured')
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  })
  return res.json() as Promise<Array<{ result: unknown }>>
}

export type GymStats = {
  downloads: number
  ratingSum: number
  ratingCount: number
}

// GET /api/marketplace/stats?hashes=h1,h2,...
export async function GET(req: NextRequest) {
  const hashes = req.nextUrl.searchParams.get('hashes')?.split(',').filter(Boolean) ?? []
  if (hashes.length === 0) return NextResponse.json({})

  try {
    // Fetch download counts and rating hashes in a single pipeline
    const cmds: unknown[][] = hashes.flatMap(h => [
      ['GET', `440hz-dl-${h}`],
      ['HMGET', `440hz-rating-${h}`, 'sum', 'count'],
    ])
    const results = await upstashPipeline(cmds)

    const stats: Record<string, GymStats> = {}
    hashes.forEach((h, i) => {
      const dlResult  = results[i * 2]?.result
      const rtResult  = results[i * 2 + 1]?.result as [string | null, string | null] | null
      stats[h] = {
        downloads:   Number(dlResult) || 0,
        ratingSum:   Number(rtResult?.[0]) || 0,
        ratingCount: Number(rtResult?.[1]) || 0,
      }
    })
    return NextResponse.json(stats)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }
}

// POST /api/marketplace/stats
// { rootHash, action: 'download' } | { rootHash, action: 'rate', value: 1-5 }
export async function POST(req: NextRequest) {
  try {
    const { rootHash, action, value } = await req.json() as {
      rootHash: string
      action: 'download' | 'rate'
      value?: number
    }
    if (!rootHash || !action) return NextResponse.json({ error: 'rootHash and action required' }, { status: 400 })

    if (action === 'download') {
      const { result } = await upstash(['INCR', `440hz-dl-${rootHash}`])
      return NextResponse.json({ downloads: result })
    }

    if (action === 'rate') {
      const v = Math.max(1, Math.min(5, Math.round(value ?? 3)))
      await upstash(['HINCRBYFLOAT', `440hz-rating-${rootHash}`, 'sum', v])
      const { result } = await upstash(['HINCRBY', `440hz-rating-${rootHash}`, 'count', 1])
      return NextResponse.json({ ratingCount: result })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }
}
