'use client'

import { useState, useEffect, useMemo } from 'react'
import { useGymStore } from '@/lib/gymStore'
import { fetchAllSubnames, resolveGymEns, type SubnameRecord, type SubnameType } from '@/lib/utils/ensSubname'
import { downloadGymBundle } from '@/lib/utils/upload0g'

type FilterType = 'all' | SubnameType

const TYPE_LABELS: Record<SubnameType, string> = {
  user: 'Users', gym: 'Gyms', model: 'Models', weights: 'Weights',
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [activeType, setActiveType] = useState<FilterType>('all')
  const [records, setRecords] = useState<SubnameRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
      || r.label.includes(q) || r.displayName.toLowerCase().includes(q)
      || r.ensName.includes(q) || r.registrant.toLowerCase().includes(q)
    return matchesType && matchesQuery
  }), [records, q, activeType])

  const counts: Record<FilterType, number> = useMemo(() => ({
    all: filtered.length,
    gym: filtered.filter(r => r.type === 'gym').length,
    user: filtered.filter(r => r.type === 'user').length,
    model: filtered.filter(r => r.type === 'model').length,
    weights: filtered.filter(r => r.type === 'weights').length,
  }), [filtered])

  const sections = (activeType === 'all'
    ? (['gym', 'user', 'model', 'weights'] as SubnameType[]).filter(t => filtered.some(r => r.type === t))
    : [activeType as SubnameType])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">ENS <em>Search</em></h1>
          <p className="page-sub">Look up users, gyms, models and weights across the 440hz network.</p>
        </div>
      </div>

      {/* Search card */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)' }}>
          <SearchIcon />
          <input
            type="text"
            autoFocus
            placeholder="Search by name, ENS name, or wallet address…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="ghost-input"
            style={{ flex: 1, fontSize: 16 }}
          />
          {query && <button className="btn ghost sm" onClick={() => setQuery('')}>Clear</button>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          {(['all', 'gym', 'user', 'model', 'weights'] as FilterType[]).map(t => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              style={{
                padding: '6px 14px', borderRadius: 999,
                background: activeType === t ? 'var(--accent-soft)' : 'transparent',
                border: `1px solid ${activeType === t ? 'var(--accent)' : 'var(--border)'}`,
                color: activeType === t ? 'var(--accent-2)' : 'var(--text-2)',
                fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                transition: 'all 0.15s', fontFamily: 'inherit',
              }}
            >
              {t === 'all' ? 'All' : TYPE_LABELS[t as SubnameType]}
              <span style={{ background: activeType === t ? 'rgba(0,0,0,0.25)' : 'var(--surface-hi)', padding: '1px 7px', borderRadius: 999, fontFamily: 'var(--font-mono)', fontSize: 11, color: activeType === t ? 'var(--accent-2)' : 'var(--text-2)' }}>
                {counts[t]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--danger)', fontSize: 13 }}>⚠ {error}</p>
          <p style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 6 }}>Could not fetch ENS data from Base Sepolia</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState query={query} activeType={activeType} hasRecords={records.length > 0} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {sections.map(type => (
            <ResultSection key={type} type={type} records={filtered.filter(r => r.type === type)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ResultSection({ type, records }: { type: SubnameType; records: SubnameRecord[] }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span className="pill accent"><span className="dot" />{TYPE_LABELS[type]}</span>
        <span className="page-sub">{records.length} result{records.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--gap, 18px)' }}>
        {records.map(r => <SubnameCard key={r.ensName} record={r} />)}
      </div>
    </section>
  )
}

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
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', transition: 'transform 0.15s, border-color 0.15s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.borderColor = ''; }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, oklch(0.65 0.18 ${(record.displayName.charCodeAt(0) * 31) % 360}), var(--accent))`, color: 'white', fontWeight: 600, fontSize: 14 }}>
          {record.displayName[0]?.toUpperCase()}
        </div>
        <span className="pill">{TYPE_LABELS[record.type]}</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{record.displayName}</div>
      <div className="mono" style={{ fontSize: 12, color: 'var(--accent-2)' }}>{record.ensName}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--surface-hi)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>
        <LinkIcon />
        <span className="mono">{addrShort}</span>
        <button className="btn ghost sm" style={{ marginLeft: 'auto', padding: '2px 6px' }}><CopyIcon /></button>
      </div>
      {record.type === 'gym' && (
        <div style={{ marginTop: 4 }}>
          {dlState === 'done' ? (
            <span style={{ fontSize: 11, color: 'var(--ok)' }}>✓ In your library</span>
          ) : (
            <button onClick={handleDownloadGym} disabled={dlState === 'loading'} className="btn sm" style={{ width: '100%', justifyContent: 'center' }}>
              {dlState === 'loading' ? 'Resolving…' : '↓ Download to Library'}
            </button>
          )}
          {dlState === 'error' && <p style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4 }}>{dlError}</p>}
        </div>
      )}
    </div>
  )
}

function EmptyState({ query, activeType, hasRecords }: { query: string; activeType: FilterType; hasRecords: boolean }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
        {!hasRecords && !query ? 'No subnames registered yet' : `No ${activeType === 'all' ? '' : TYPE_LABELS[activeType as SubnameType].toLowerCase() + ' '}results${query ? ` for "${query}"` : ''}`}
      </p>
      <p style={{ fontSize: 12, marginTop: 6 }}>
        {!hasRecords && !query ? 'Publish a gym or complete onboarding to register your first ENS subname' : 'Try a different name or switch the type filter'}
      </p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {[0, 1].map(s => (
        <div key={s}>
          <div style={{ height: 24, width: 100, background: 'var(--surface-hi)', borderRadius: 999, marginBottom: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="card" style={{ height: 128, opacity: 0.5 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SearchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
}
function LinkIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14a5 5 0 0 1 0-7l3-3a5 5 0 0 1 7 7l-1 1"/><path d="M14 10a5 5 0 0 1 0 7l-3 3a5 5 0 0 1-7-7l1-1"/></svg>
}
function CopyIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
}
