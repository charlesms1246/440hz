'use client'

import { useState, useEffect, useMemo } from 'react'
import { useGymStore } from '@/lib/gymStore'
import { fetchAllSubnames, resolveGymEns, type SubnameRecord, type SubnameType } from '@/lib/utils/ensSubname'
import { downloadGymBundle } from '@/lib/utils/upload0g'

type FilterType = 'all' | SubnameType

const TYPE_LABELS: Record<SubnameType, string> = {
  user: 'Users',
  gym: 'Gyms',
  model: 'Models',
  weights: 'Weights',
}

const TYPE_COLORS: Record<SubnameType, string> = {
  user:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
  gym:     'border-purple/30 bg-purple/10 text-purple-400',
  model:   'border-green/30 bg-green/10 text-green',
  weights: 'border-amber/30 bg-amber/10 text-amber',
}

export default function SearchPage() {
  const [query, setQuery]         = useState('')
  const [activeType, setActiveType] = useState<FilterType>('all')
  const [records, setRecords]     = useState<SubnameRecord[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  useEffect(() => {
    fetchAllSubnames()
      .then(setRecords)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load ENS data'))
      .finally(() => setLoading(false))
  }, [])

  const q = query.toLowerCase().trim()

  const filtered = useMemo(() => records.filter(r => {
    const matchesType = activeType === 'all' || r.type === activeType
    const matchesQuery = q === ''
      || r.label.includes(q)
      || r.displayName.toLowerCase().includes(q)
      || r.ensName.includes(q)
      || r.registrant.toLowerCase().includes(q)
    return matchesType && matchesQuery
  }), [records, q, activeType])

  const counts: Record<FilterType, number> = useMemo(() => ({
    all:     filtered.length,
    gym:     filtered.filter(r => r.type === 'gym').length,
    user:    filtered.filter(r => r.type === 'user').length,
    model:   filtered.filter(r => r.type === 'model').length,
    weights: filtered.filter(r => r.type === 'weights').length,
  }), [filtered])

  const sections: SubnameType[] = activeType === 'all'
    ? (['gym', 'user', 'model', 'weights'] as SubnameType[]).filter(t => filtered.some(r => r.type === t))
    : [activeType as SubnameType]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search header */}
      <div className="px-6 py-5 border-b border-border bg-surface">
        <h1 className="text-base font-semibold text-white mb-3">ENS Search</h1>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            autoFocus
            placeholder="Search by name, ENS name, or wallet address…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-surface-2 border border-border rounded-xl text-sm text-white placeholder:text-muted/50 focus:outline-none focus:border-purple/50 transition-colors"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors">
              ✕
            </button>
          )}
        </div>

        {/* Type filters */}
        <div className="flex items-center gap-2 mt-3 overflow-x-auto">
          {(['all', 'gym', 'user', 'model', 'weights'] as FilterType[]).map(t => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-full border whitespace-nowrap transition-all ${
                activeType === t
                  ? 'border-purple bg-purple/10 text-purple-400'
                  : 'border-border text-muted hover:text-white hover:border-gray-500'
              }`}
            >
              {t === 'all' ? 'All' : TYPE_LABELS[t as SubnameType]}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${activeType === t ? 'bg-purple/20' : 'bg-surface-2'}`}>
                {counts[t]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-[13px] text-signal-red">⚠ {error}</p>
            <p className="text-[11px] text-muted">Could not fetch ENS data from Base Sepolia</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState query={query} activeType={activeType} hasRecords={records.length > 0} />
        ) : (
          <div className="space-y-8">
            {sections.map(type => (
              <ResultSection
                key={type}
                type={type}
                records={filtered.filter(r => r.type === type)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section with type header + grid ──────────────────────────────────────────

function ResultSection({ type, records }: { type: SubnameType; records: SubnameRecord[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TYPE_COLORS[type]}`}>
          {TYPE_LABELS[type]}
        </span>
        <span className="text-[11px] text-muted">{records.length} result{records.length !== 1 ? 's' : ''}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {records.map(r => (
          <SubnameCard key={r.ensName} record={r} />
        ))}
      </div>
    </div>
  )
}

// ── Individual result card ────────────────────────────────────────────────────

function SubnameCard({ record }: { record: SubnameRecord }) {
  const { addSavedGym, savedGyms } = useGymStore()
  const ownedCids = new Set(savedGyms.map(g => g.rootHash))
  const [dlState, setDlState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [dlError, setDlError] = useState('')

  async function handleDownloadGym() {
    setDlState('loading')
    setDlError('')
    try {
      const { currentRootHash } = await resolveGymEns(record.ensName)
      if (!currentRootHash) throw new Error('No version manifest found for this gym')
      if (ownedCids.has(currentRootHash)) { setDlState('done'); return }
      const bundle = await downloadGymBundle(currentRootHash)
      addSavedGym({ rootHash: currentRootHash, name: bundle.projectName, savedAt: new Date().toISOString() })
      setDlState('done')
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Download failed')
      setDlState('error')
    }
  }

  const addrShort = `${record.registrant.slice(0, 6)}…${record.registrant.slice(-4)}`

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-purple/30 transition-colors">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white truncate">{record.displayName}</p>
          <p className="text-[11px] font-mono text-purple-400 truncate mt-0.5">{record.ensName}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${TYPE_COLORS[record.type]}`}>
          {TYPE_LABELS[record.type]}
        </span>
      </div>

      {/* Registrant */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className="w-3.5 h-3.5 bg-surface-2 border border-border rounded-full flex items-center justify-center text-[8px] font-bold text-purple-400">
          {record.registrant[2]?.toUpperCase()}
        </span>
        <span className="font-mono">{addrShort}</span>
      </div>

      {/* Action */}
      {record.type === 'gym' && (
        <div>
          {dlState === 'done' ? (
            <span className="text-[11px] text-green">✓ In your library</span>
          ) : (
            <button
              onClick={handleDownloadGym}
              disabled={dlState === 'loading'}
              className="text-[11px] font-medium px-3 py-1.5 border border-purple/40 text-purple-400 hover:bg-purple/10 rounded-lg transition-all disabled:opacity-50 w-full"
            >
              {dlState === 'loading' ? 'Resolving…' : '↓ Download to Library'}
            </button>
          )}
          {dlState === 'error' && (
            <p className="text-[10px] text-signal-red mt-1 truncate">{dlError}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Empty / initial states ────────────────────────────────────────────────────

function EmptyState({ query, activeType, hasRecords }: { query: string; activeType: FilterType; hasRecords: boolean }) {
  if (!hasRecords && !query) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="w-12 h-12 bg-surface-2 border border-border rounded-xl flex items-center justify-center text-xl">🔍</div>
        <p className="text-[13px] text-white font-medium">No subnames registered yet</p>
        <p className="text-[12px] text-muted max-w-xs">Publish a gym or complete onboarding to register your first ENS subname under 440hz.eth</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <div className="w-12 h-12 bg-surface-2 border border-border rounded-xl flex items-center justify-center text-xl">🔍</div>
      <p className="text-[13px] text-white font-medium">
        No {activeType === 'all' ? '' : TYPE_LABELS[activeType as SubnameType].toLowerCase() + ' '}results
        {query ? ` for "${query}"` : ''}
      </p>
      <p className="text-[12px] text-muted">Try a different name or switch the type filter</p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      {[0, 1].map(s => (
        <div key={s}>
          <div className="h-5 w-24 bg-surface-2 rounded-full animate-pulse mb-3" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-surface border border-border rounded-xl p-4 h-32 animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
