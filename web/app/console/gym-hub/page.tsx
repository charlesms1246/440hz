'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useGymStore, type GymEntry } from '@/lib/gymStore'
import { downloadGymBundle } from '@/lib/utils/upload0g'
import { fetchMarketListings, type MarketListing } from '@/lib/utils/kvMarketplace'
import { contractPurchaseGym } from '@/lib/contracts'
import { resolveGymEns, buildEnsName } from '@/lib/utils/ensSubname'

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
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGym, setSelectedGym] = useState<MarketListing | null>(null)

  // ENS lookup
  const [ensLoading, setEnsLoading] = useState(false)
  const [ensResult, setEnsResult]   = useState<string | null>(null)
  const [ensError, setEnsError]     = useState('')

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

  const q = searchQuery.toLowerCase()
  const filtered = marketListings.filter(g =>
    (category === 'All' || g.category === category) &&
    (q === '' || g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q))
  )

  function looksLikeEns(q: string) {
    const t = q.trim()
    return t.endsWith('.eth') || (!t.includes(' ') && t.length > 0 && /^[\w-]+$/.test(t))
  }

  async function handleEnsLookup(query = searchQuery) {
    if (!query.trim()) return
    setEnsLoading(true)
    setEnsError('')
    setEnsResult(null)
    try {
      const fullName = query.includes('.')
        ? query.trim()
        : buildEnsName(query.trim(), 'gym')
      const { currentRootHash } = await resolveGymEns(fullName)
      if (!currentRootHash) {
        setEnsError('ENS name not found or no version manifest set.')
        return
      }
      if (ownedCids.has(currentRootHash)) {
        setEnsResult(`Already in your library: ${fullName}`)
        return
      }
      const bundle = await downloadGymBundle(currentRootHash)
      addSavedGym({ rootHash: currentRootHash, name: bundle.projectName, savedAt: new Date().toISOString() })
      setEnsResult(`Added to library: ${bundle.projectName}`)
    } catch (e) {
      setEnsError(e instanceof Error ? e.message : 'Lookup failed')
    } finally {
      setEnsLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title"> <em> Gym Hub</em></h1>
          {/* <p className="page-sub">Browse and manage training environments</p> */}
        </div>
        <div style={{ display: 'flex', background: 'var(--surface-hi)', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
          {(['owned', 'marketplace'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ fontSize: 12, fontWeight: 500, padding: '6px 16px', borderRadius: 8, background: tab === t ? 'var(--surface-solid)' : 'transparent', color: tab === t ? 'var(--text)' : 'var(--text-3)', border: 'none', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' }}
            >
              {t === 'owned' ? `Owned (${savedGyms.length})` : 'Marketplace'}
            </button>
          ))}
        </div>
      </div>

      {/* Search (marketplace only) */}
      {tab === 'marketplace' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              placeholder="Search by name, description, or ENS (e.g. foo-gym.440hz.eth)…"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setEnsError(''); setEnsResult(null) }}
              onKeyDown={e => { if (e.key === 'Enter' && !ensLoading && looksLikeEns(searchQuery)) handleEnsLookup() }}
              className="ghost-input"
              style={{ flex: 1, fontSize: 13 }}
            />
            {looksLikeEns(searchQuery) && (
              <button onClick={() => handleEnsLookup()} disabled={ensLoading || !searchQuery.trim()} className="btn ghost sm">
                {ensLoading ? '…' : 'Resolve ENS'}
              </button>
            )}
          </div>
          {ensResult && <p style={{ fontSize: 11, color: 'var(--ok)', margin: 0 }}>{ensResult}</p>}
          {ensError && <p style={{ fontSize: 11, color: 'var(--danger)', margin: 0 }}>{ensError}</p>}
        </div>
      )}

      {/* Category filters (marketplace only) */}
      {tab === 'marketplace' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(c)} style={{ padding: '5px 14px', borderRadius: 999, background: category === c ? 'var(--accent-soft)' : 'transparent', border: `1px solid ${category === c ? 'var(--accent)' : 'var(--border)'}`, color: category === c ? 'var(--accent-2)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div>
        {tab === 'owned' ? (
          savedGyms.length === 0 ? (
            <OwnedEmptyState />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {savedGyms.map(gym => (
                <OwnedCard key={gym.rootHash} gym={gym} />
              ))}
            </div>
          )
        ) : (
          <>
            {marketErr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 16, border: '1px solid oklch(0.80 0.14 75 / 0.3)', background: 'oklch(0.80 0.14 75 / 0.1)', color: 'var(--warn)', fontSize: 11, borderRadius: 8 }}>
                <span>⚠ Showing cached listings — {marketErr}</span>
                <button onClick={() => setMarketErr('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>✕</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {loadingMarket ? (
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} className="card" style={{ height: 208, opacity: 0.5 }} />
                  ))}
                </div>
              ) : (
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: selectedGym ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 16 }}>
                  {filtered.map(gym => (
                    <MarketCard
                      key={gym.rootHash}
                      gym={gym}
                      isOwned={ownedCids.has(gym.rootHash)}
                      isSelected={selectedGym?.rootHash === gym.rootHash}
                      onSelect={() => setSelectedGym(prev => prev?.rootHash === gym.rootHash ? null : gym)}
                      onDownload={async () => {
                        if (gym.cost !== 'Free') {
                          const priceWei = BigInt(Math.round(parseFloat(gym.cost) * 1e18))
                          await contractPurchaseGym(gym.rootHash, priceWei)
                        }
                        const bundle = await downloadGymBundle(gym.rootHash)
                        addSavedGym({ rootHash: gym.rootHash, name: bundle.projectName || gym.name, savedAt: new Date().toISOString() })
                      }}
                    />
                  ))}
                </div>
              )}
              {selectedGym && (
                <GymDetailSidebar
                  gym={selectedGym}
                  isOwned={ownedCids.has(selectedGym.rootHash)}
                  onClose={() => setSelectedGym(null)}
                  onDownload={async () => {
                    if (selectedGym.cost !== 'Free') {
                      const priceWei = BigInt(Math.round(parseFloat(selectedGym.cost) * 1e18))
                      await contractPurchaseGym(selectedGym.rootHash, priceWei)
                    }
                    const bundle = await downloadGymBundle(selectedGym.rootHash)
                    addSavedGym({ rootHash: selectedGym.rootHash, name: bundle.projectName || selectedGym.name, savedAt: new Date().toISOString() })
                  }}
                />
              )}
            </div>
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
    <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🏟️</div>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>No gyms saved yet</p>
      <p style={{ fontSize: 12, marginTop: 6, maxWidth: 280, margin: '6px auto 0' }}>
        Build a gym in the Gym Builder and hit Save or Publish to add it here.
      </p>
      <button onClick={() => router.push('/console/gym-builder')} className="btn sm" style={{ marginTop: 16 }}>
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

  const savedDate = new Date(gym.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = ''; (e.currentTarget as HTMLElement).style.transform = ''; }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent)', display: 'grid', placeItems: 'center', fontSize: 18 }}>🏟️</div>
        <span className="pill running">Saved</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{gym.name}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{savedDate}</div>
      <div className="mono" onClick={copyHash} title={gym.rootHash} style={{ fontSize: 10, color: 'var(--text-3)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 4 }}>
        {gym.rootHash.slice(0, 20)}…{gym.rootHash.slice(-6)}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={copyHash} className="btn ghost sm" style={{ flex: 1, justifyContent: 'center' }}>{copied ? '✓ Copied' : 'Copy Hash'}</button>
        <button onClick={() => { sessionStorage.setItem('440hz-open-gym-hash', gym.rootHash); router.push('/console/gym-builder'); }} className="btn sm" style={{ flex: 1, justifyContent: 'center' }}>Open →</button>
      </div>
    </div>
  )
}

// ── Marketplace tab ────────────────────────────────────────────

function ComplexityBar({ value }: { value: number }) {
  const color = value >= 90 ? 'var(--danger)' : value >= 70 ? 'var(--warn)' : 'var(--ok)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="progress-track" style={{ flex: 1 }}>
        <div className="progress-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', width: 24 }}>{value}</span>
    </div>
  )
}

type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error'

function MarketCard({
  gym,
  isOwned,
  isSelected,
  onSelect,
  onDownload,
}: {
  gym: MarketListing
  isOwned: boolean
  isSelected?: boolean
  onSelect: () => void
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
    if (owned) return <button disabled className="btn ghost sm" style={{ width: '100%', justifyContent: 'center', opacity: 1, color: 'var(--ok)', borderColor: 'oklch(0.78 0.14 150 / 0.3)' }}>✓ In Library</button>
    if (gym.cost !== 'Free') return <button disabled className="btn ghost sm" style={{ width: '100%', justifyContent: 'center', opacity: 0.6 }} title="On-chain licensing coming soon">License · {gym.cost}</button>
    return (
      <button onClick={handleDownload} disabled={dlStatus === 'downloading'} className="btn sm" style={{ width: '100%', justifyContent: 'center', background: dlStatus === 'error' ? 'oklch(0.68 0.21 25 / 0.15)' : undefined, color: dlStatus === 'error' ? 'var(--danger)' : undefined }}>
        {dlStatus === 'downloading' ? '⬇ Pulling from 0G Storage...' : dlStatus === 'error' ? '✕ Failed — retry' : 'Download Free'}
      </button>
    )
  }

  const licenseClass = gym.license === 'Open' ? 'running' : gym.license === 'Enterprise' ? 'paused' : 'pending'

  return (
    <div
      className="card"
      onClick={onSelect}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, transition: 'transform 0.15s, border-color 0.15s', cursor: 'pointer', borderColor: isSelected ? 'var(--accent)' : undefined }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = ''; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-hi)', display: 'grid', placeItems: 'center', fontSize: 18 }}>{icon}</div>
        <span className={`pill ${licenseClass}`}>{gym.license}</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{gym.name}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{gym.category}</div>
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>Complexity</div>
        <ComplexityBar value={gym.complexity} />
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {gym.rootHash.slice(0, 16)}…{gym.rootHash.slice(-6)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)' }}>
        <span>⭐ {gym.rating ?? '—'}</span>
        <span>{gym.downloads?.toLocaleString() ?? '0'} pulls</span>
      </div>
      {dlStatus === 'error' && dlError && <p style={{ fontSize: 10, color: 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={dlError}>{dlError}</p>}
      <div style={{ marginTop: 'auto', paddingTop: 4 }} onClick={e => e.stopPropagation()}>{renderButton()}</div>
    </div>
  )
}

// ── Gym detail sidebar ─────────────────────────────────────────

function GymDetailSidebar({
  gym,
  isOwned,
  onClose,
  onDownload,
}: {
  gym: MarketListing
  isOwned: boolean
  onClose: () => void
  onDownload: () => Promise<void>
}) {
  const [dlStatus, setDlStatus] = useState<DownloadStatus>('idle')
  const [dlError, setDlError]   = useState('')
  const [copied, setCopied]     = useState(false)

  const icon =
    gym.category === 'Coding'   ? '💻' :
    gym.category === 'Trading'  ? '📈' :
    gym.category === 'Physics'  ? '⚛️' :
    gym.category === 'Robotics' ? '🤖' :
    gym.category === 'Math'     ? '🧮' : '💬'

  const licenseClass = gym.license === 'Open' ? 'running' : gym.license === 'Enterprise' ? 'paused' : 'pending'
  const owned = isOwned || dlStatus === 'done'

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

  function copyHash() {
    navigator.clipboard.writeText(gym.rootHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const publishedDate = gym.publishedAt
    ? new Date(gym.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="card" style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: 20, alignSelf: 'flex-start', position: 'sticky', top: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface-hi)', display: 'grid', placeItems: 'center', fontSize: 20, flexShrink: 0 }}>{icon}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{gym.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{gym.category}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16, lineHeight: 1, padding: 2 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)' }}>✕</button>
      </div>

      {/* Pills */}
      <div style={{ display: 'flex', gap: 6 }}>
        <span className={`pill ${licenseClass}`}>{gym.license}</span>
        <span className="pill" style={{ background: 'var(--surface-hi)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>{gym.category}</span>
      </div>

      {/* Description */}
      <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>{gym.description}</p>

      {/* Complexity */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6 }}>Complexity</div>
        <ComplexityBar value={gym.complexity} />
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>Rating</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>⭐ {gym.rating ?? '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>Downloads</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{gym.downloads?.toLocaleString() ?? '0'}</div>
        </div>
        {gym.cost !== 'Free' && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>Cost</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warn)' }}>{gym.cost}</div>
          </div>
        )}
      </div>

      {/* Publisher / date */}
      {(gym.publishedBy || publishedDate) && (
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {gym.publishedBy && <span>By <span style={{ color: 'var(--text-2)' }}>{gym.publishedBy}</span></span>}
          {gym.publishedBy && publishedDate && <span> · </span>}
          {publishedDate && <span>{publishedDate}</span>}
        </div>
      )}

      {/* Hash */}
      <div
        className="mono"
        onClick={copyHash}
        title={gym.rootHash}
        style={{ fontSize: 10, color: 'var(--text-3)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '5px 8px', borderRadius: 6, background: 'var(--surface-hi)', border: '1px solid var(--border)' }}
      >
        {copied ? '✓ Copied' : `${gym.rootHash.slice(0, 20)}…${gym.rootHash.slice(-6)}`}
      </div>

      {/* Action */}
      <div style={{ marginTop: 4 }}>
        {owned
          ? <button disabled className="btn ghost sm" style={{ width: '100%', justifyContent: 'center', opacity: 1, color: 'var(--ok)', borderColor: 'oklch(0.78 0.14 150 / 0.3)' }}>✓ In Library</button>
          : gym.cost !== 'Free'
            ? <button disabled className="btn ghost sm" style={{ width: '100%', justifyContent: 'center', opacity: 0.6 }} title="On-chain licensing coming soon">License · {gym.cost}</button>
            : <button onClick={handleDownload} disabled={dlStatus === 'downloading'} className="btn sm" style={{ width: '100%', justifyContent: 'center' }}>
                {dlStatus === 'downloading' ? '⬇ Pulling from 0G Storage...' : dlStatus === 'error' ? '✕ Failed — retry' : 'Download Free'}
              </button>
        }
        {dlStatus === 'error' && dlError && <p style={{ fontSize: 10, color: 'var(--danger)', marginTop: 6 }}>{dlError}</p>}
      </div>
    </div>
  )
}
