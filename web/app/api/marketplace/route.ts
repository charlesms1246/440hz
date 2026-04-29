import { NextResponse } from 'next/server'

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const LIST_KEY      = '440hz-market'

async function upstash(cmd: unknown[]) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    throw new Error('Upstash env vars not configured')
  }
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmd),
  })
  return res.json()
}

// GET /api/marketplace — returns all listings newest-first
export async function GET() {
  try {
    const { result } = await upstash(['LRANGE', LIST_KEY, 0, -1])
    const listings = ((result as string[]) ?? []).map(s => JSON.parse(s)).reverse()
    return NextResponse.json(listings)
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 503 }
    )
  }
}

// POST /api/marketplace — appends one listing
export async function POST(req: Request) {
  try {
    const listing = await req.json()
    await upstash(['RPUSH', LIST_KEY, JSON.stringify(listing)])
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 503 }
    )
  }
}
