'use client'

import { Indexer } from '@0gfoundation/0g-ts-sdk'

const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai'

/**
 * Download a 0G Storage object by root hash and trigger a browser file save.
 * The adapter upload in core/executor/storage.py produces a zip archive;
 * pass a .zip filename so the browser offers the right extension.
 */
export async function downloadAdapterFromStorage(
  rootHash: string,
  filename: string,
): Promise<void> {
  const indexer = new Indexer(INDEXER_URL)
  const [blob, err] = await indexer.downloadToBlob(rootHash)
  if (err != null) throw new Error(`0G download failed: ${String(err)}`)

  const url = URL.createObjectURL(blob as Blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
}
