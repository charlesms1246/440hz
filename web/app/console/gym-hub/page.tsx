'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useGymStore, type GymEntry } from '@/lib/gymStore'
import { downloadGymBundle } from '@/lib/utils/upload0g'
import { fetchMarketListings, type MarketListing } from '@/lib/utils/kvMarketplace'
import { contractPurchaseGym } from '@/lib/contracts'

const categories = ['All', 'Coding', 'Trading', 'Physics', 'Robotics', 'Math', 'Language']

// Seed data shown while loading or as fallback when both 0G KV and Upstash are unavailable
const SEED_GYMS: MarketListing[] = [
  { rootHash: 'bafybeief...3lz9', name: 'CodingGym-v2',   description: 'Code generation and debugging environment', category: 'Coding',   complexity: 68, license: 'Open',       cost: 'Free',    publishedAt: '2025-01-01T00:00:00Z', publishedBy: '', rating: 4.6, downloads: 8320 },
  { rootHash: 'bafybeia...5xq3',  name: 'DialogueEnv-v1', description: 'Multi-turn dialogue training environment',   category: 'Language', complexity: 62, license: 'Open',       cost: 'Free',    publishedAt: '2025-01-01T00:00:00Z', publishedBy: '', rating: 4.3, downloads: 5410 },
  { rootHash: 'bafybeig...7mn5',  name: 'PhysicsSim-v1',  description: 'Physics simulation with reward shaping',     category: 'Physics',  complexity: 88, license: 'Pro',        cost: '120 $0G', publishedAt: '2025-01-01T00:00:00Z', publishedBy: '', rating: 4.7, downloads: 2890 },
  { rootHash: 'bafybeih...2kp8',  name: 'ForexTrader-v1', description: 'Forex market trading simulation',            category: 'Trading',  complexity: 91, license: 'Pro',        cost: '250 $0G', publishedAt: '2025-01-01T00:00:00Z', publishedBy: '', rating: 4.5, downloads: 1670 },
  { rootHash: 'bafybeie...8qr2',  name: 'RoboticsLab-v2', description: 'Advanced robotics task environment',         category: 'Robotics', complexity: 94, license: 'Enterprise', cost: '500 $0G', publishedAt: '2025-01-01T00:00:00Z', publishedBy: '', rating: 4.8, downloads: 1240 },
  { rootHash: 'bafybeib...1rw7',  name: 'AdvMath-v2',     description: 'Advanced mathematics reasoning tasks',       category: 'Math',     complexity: 97, license: 'Enterprise', cost: '800 $0G', publishedAt: '2025-01-01T00:00:00Z', publishedBy: '', rating: 4.9, downloads: 340  },
]

export default function GymHubPage() {
  const [tab, setTab]           = useState<'owned' | 'marketplace'>('marketplace')
  const [category, setCategory] = useState('All')

  // Marketplace live data
  const [marketListings, setMarketListings] = useState<MarketListing[]>([])
  const [loadingMarket, setLoadingMarket]   = useState(false)
  const [marketErr, setMarketErr]           = useState('')

  useEffect(() => {
    if (tab !== 'marketplace') return
    setLoadingMarket(true)
    setMarketErr('')
    fetchMarketListings()
      .then(data => setMarketListings(data.length > 0 ? data : SEED_GYMS))
      .catch(e => { setMarketErr(e.message); setMarketListings(SEED_GYMS) })
      .finally(() => setLoadingMarket(false))
  }, [tab])

  const { savedGyms, addSavedGym } = useGymStore()
  const ownedCids = new Set(savedGyms.map(g => g.rootHash))
  const filtered = marketListings.filter(g => category === 'All' || g.category === category)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-white">Gym Hub</h1>
            <p className="text-[11px] text-muted">Browse and manage training environments</p>
          </div>
          <div className="flex bg-surface-2 p-0.5">
            {(['owned', 'marketplace'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-[12px] font-medium px-4 py-1.5 transition-all capitalize ${tab === t ? 'bg-surface text-white shadow' : 'text-muted hover:text-gray-300'}`}
              >
                {t === 'owned' ? `Owned (${savedGyms.length})` : 'Marketplace'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category filters (marketplace only) */}
      {tab === 'marketplace' && (
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border overflow-x-auto">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`text-[11px] whitespace-nowrap px-3 py-1.5 border transition-all ${category === c ? 'border-purple bg-purple/10 text-purple-400' : 'border-border text-muted hover:text-white hover:border-gray-500'}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'owned' ? (
          savedGyms.length === 0 ? (
            <OwnedEmptyState />
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {savedGyms.map(gym => (
                <OwnedCard key={gym.rootHash} gym={gym} />
              ))}
            </div>
          )
        ) : (
          <>
            {marketErr && (
              <div className="flex items-center gap-2 px-3 py-2 mb-4 border border-amber/30 bg-amber/10 text-amber text-[11px]">
                <span>⚠ Showing cached listings — {marketErr}</span>
                <button onClick={() => setMarketErr('')} className="ml-auto text-muted hover:text-white">✕</button>
              </div>
            )}
            {loadingMarket ? (
              <div className="grid grid-cols-3 gap-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="bg-surface border border-border p-4 h-52 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {filtered.map(gym => (
                  <MarketCard
                    key={gym.rootHash}
                    gym={gym}
                    isOwned={ownedCids.has(gym.rootHash)}
                    onDownload={async () => {
                      // Record purchase on-chain (free gyms pass value 0n)
                      const priceWei = gym.cost === 'Free'
                        ? 0n
                        : BigInt(Math.round(parseFloat(gym.cost) * 1e18))
                      await contractPurchaseGym(gym.rootHash, priceWei)
                      const bundle = await downloadGymBundle(gym.rootHash)
                      addSavedGym({ rootHash: gym.rootHash, name: bundle.projectName || gym.name, savedAt: new Date().toISOString() })
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Owned tab ─────────────────────────────────────────────────

function OwnedEmptyState() {
  const router = useRouter()
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <div className="w-12 h-12 bg-surface-2 border border-border flex items-center justify-center text-2xl">
        🏟️
      </div>
      <p className="text-[13px] text-white font-medium">No gyms saved yet</p>
      <p className="text-[12px] text-muted max-w-xs">
        Build a gym in the Gym Builder and hit Save or Publish to add it here.
      </p>
      <button
        onClick={() => router.push('/console/gym-builder')}
        className="text-[12px] px-4 py-1.5 bg-purple hover:bg-purple/80 text-white transition-colors"
      >
        Open Gym Builder →
      </button>
    </div>
  )
}

function OwnedCard({ gym }: { gym: GymEntry }) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  function copyHash() {
    navigator.clipboard.writeText(gym.rootHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const savedDate = new Date(gym.savedAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="bg-surface border border-border p-4 hover:border-gray-600 transition-colors group flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 bg-purple/20 flex items-center justify-center text-lg shrink-0">
          🏟️
        </div>
        <span className="text-[10px] px-2 py-0.5 border border-green/30 bg-green/10 text-green">
          Saved
        </span>
      </div>

      <div className="text-[13px] font-semibold text-white mb-0.5">{gym.name}</div>
      <div className="text-[11px] text-muted mb-3">{savedDate}</div>

      <div className="flex items-center gap-1 mb-1">
        <span className="text-[10px] text-muted">Root hash</span>
      </div>
      <div
        className="text-[10px] font-mono text-muted/80 truncate mb-4 cursor-pointer hover:text-white transition-colors"
        title={gym.rootHash}
        onClick={copyHash}
      >
        {gym.rootHash.slice(0, 20)}…{gym.rootHash.slice(-6)}
      </div>

      <div className="flex items-center gap-2 mt-auto">
        <button
          onClick={copyHash}
          className="text-[11px] px-2.5 py-1.5 border border-border text-muted hover:text-white transition-colors flex-1"
        >
          {copied ? '✓ Copied' : 'Copy Hash'}
        </button>
        <button
          onClick={() => router.push('/console/gym-builder')}
          className="text-[11px] px-2.5 py-1.5 bg-purple/20 hover:bg-purple/30 text-purple-400 transition-colors flex-1"
        >
          Open →
        </button>
      </div>
    </div>
  )
}

// ── Marketplace tab ────────────────────────────────────────────

function ComplexityBar({ value }: { value: number }) {
  const color = value >= 90 ? 'bg-signal-red' : value >= 70 ? 'bg-amber' : 'bg-green'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-border overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted w-6">{value}</span>
    </div>
  )
}

type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error'

function MarketCard({
  gym,
  isOwned,
  onDownload,
}: {
  gym: MarketListing
  isOwned: boolean
  onDownload: () => Promise<void>
}) {
  const [dlStatus, setDlStatus] = useState<DownloadStatus>('idle')
  const [dlError, setDlError]   = useState('')

  const icon =
    gym.category === 'Coding'   ? '💻' :
    gym.category === 'Trading'  ? '📈' :
    gym.category === 'Physics'  ? '⚛️' :
    gym.category === 'Robotics' ? '🤖' :
    gym.category === 'Math'     ? '🧮' : '💬'

  async function handleDownload() {
    setDlStatus('downloading')
    setDlError('')
    try {
      await onDownload()
      setDlStatus('done')
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Download failed')
      setDlStatus('error')
      setTimeout(() => setDlStatus('idle'), 4000)
    }
  }

  const owned = isOwned || dlStatus === 'done'

  function renderButton() {
    if (owned) {
      return (
        <button disabled className="w-full text-[12px] py-1.5 font-medium mt-auto bg-green/10 text-green border border-green/30 cursor-default">
          ✓ In Library
        </button>
      )
    }
    if (gym.cost !== 'Free') {
      return (
        <button disabled className="w-full text-[12px] py-1.5 font-medium mt-auto bg-purple/20 text-purple-400 border border-purple/30 cursor-default" title="On-chain licensing coming soon">
          License · {gym.cost}
        </button>
      )
    }
    return (
      <button
        onClick={handleDownload}
        disabled={dlStatus === 'downloading'}
        className={`w-full text-[12px] py-1.5 font-medium transition-all mt-auto ${
          dlStatus === 'downloading' ? 'bg-green/20 text-green border border-green/30 cursor-wait' :
          dlStatus === 'error'       ? 'bg-signal-red/20 text-signal-red border border-signal-red/30' :
                                       'bg-green hover:bg-green/80 text-white'
        }`}
      >
        {dlStatus === 'downloading' ? '⬇ Pulling from 0G Storage...' :
         dlStatus === 'error'       ? '✕ Failed — retry' :
                                      'Download Free'}
      </button>
    )
  }

  return (
    <div className="bg-surface border border-border p-4 hover:border-gray-600 transition-colors flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 bg-surface-2 flex items-center justify-center text-lg">{icon}</div>
        <span className={`text-[10px] px-2 py-0.5 border ${
          gym.license === 'Open'       ? 'border-green/30 bg-green/10 text-green' :
          gym.license === 'Enterprise' ? 'border-amber/30 bg-amber/10 text-amber' :
                                         'border-purple/30 bg-purple/10 text-purple-400'
        }`}>
          {gym.license}
        </span>
      </div>
      <div className="text-[13px] font-semibold text-white mb-0.5">{gym.name}</div>
      <div className="text-[11px] text-muted mb-3">{gym.category}</div>
      <div className="mb-2">
        <div className="text-[10px] text-muted mb-1">Complexity</div>
        <ComplexityBar value={gym.complexity} />
      </div>
      <div className="text-[10px] font-mono text-muted truncate mb-3">
        {gym.rootHash.slice(0, 16)}…{gym.rootHash.slice(-6)}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted mb-3">
        <span>⭐ {gym.rating ?? '—'}</span>
        <span>{gym.downloads?.toLocaleString() ?? '0'} pulls</span>
      </div>
      {dlStatus === 'error' && dlError && (
        <p className="text-[10px] text-signal-red mb-2 truncate" title={dlError}>{dlError}</p>
      )}
      {renderButton()}
    </div>
  )
}
