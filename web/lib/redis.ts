import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Lightweight index stored in KV and Redis keyed by wallet address (lowercase)
export type ProfileIndex = {
  ensName: string
  storageSequence: number
  rootHash?: string
}
