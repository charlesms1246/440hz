import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })

  const members = await redis.smembers<string[]>(`ens:subnames:${address.toLowerCase()}`)
  return NextResponse.json({ subnames: members ?? [] })
}
