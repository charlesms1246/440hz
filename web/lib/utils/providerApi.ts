'use client'

/**
 * Thin wrapper around fetch for provider API calls.
 *
 * Handles two things automatically:
 *  1. Strips trailing slash from the base URL so paths don't double-slash.
 *  2. Adds `ngrok-skip-browser-warning` header so ngrok free-tier tunnels
 *     return JSON instead of serving an HTML interstitial warning page.
 */

export const PROVIDER_API = (
  (process.env.NEXT_PUBLIC_PROVIDER_API_URL ?? 'http://localhost:8420')
    .replace(/\/$/, '')   // strip trailing slash
)

const NGROK_HEADERS: Record<string, string> = PROVIDER_API.includes('ngrok')
  ? { 'ngrok-skip-browser-warning': 'true' }
  : {}

export function providerFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${PROVIDER_API}${path}`
  return fetch(url, {
    ...init,
    headers: {
      ...NGROK_HEADERS,
      ...(init?.headers ?? {}),
    },
  })
}

export function providerEventSource(path: string): EventSource {
  // EventSource doesn't support custom headers — use URL param as fallback for ngrok
  const url = PROVIDER_API.includes('ngrok')
    ? `${PROVIDER_API}${path}?ngrok-skip-browser-warning=true`
    : `${PROVIDER_API}${path}`
  return new EventSource(url)
}
