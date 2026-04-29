import { useState } from 'react'
import { Search, Sparkles, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react'
import { NODE_CATEGORIES } from '@nodeui/nodes/registry'
import { SidebarCategory } from './SidebarCategory'
import { ChatPanel } from './ChatPanel'
import { useResize } from '@nodeui/hooks/useResize'

type Mode = 'palette' | 'agent'

const TABS: { id: Mode; label: string; Icon: React.ElementType }[] = [
  { id: 'palette', label: 'Nodes',    Icon: LayoutGrid },
  { id: 'agent',   label: 'AI Agent', Icon: Sparkles   },
]

export function Sidebar() {
  const [mode, setMode] = useState<Mode>('palette')
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const { width, onMouseDown } = useResize(220, 600, 220, 'right')

  const expand = (m: Mode) => {
    setMode(m)
    setCollapsed(false)
  }

  /* ── Collapsed rail ── */
  if (collapsed) {
    return (
      <div style={{
        width: 40, flexShrink: 0,
        background: 'var(--nodeui-surface)',
        borderRight: '1px solid var(--nodeui-border-subtle)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 6, gap: 2,
      }}>
        {TABS.map(({ id, Icon }) => {
          const active = mode === id
          return (
            <button
              key={id}
              title={id === 'palette' ? 'Node Palette' : 'AI Agent'}
              onClick={() => expand(id)}
              style={{
                width: 32, height: 32, borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? '#6366f122' : 'none',
                border: active ? '1px solid #6366f144' : '1px solid transparent',
                color: active ? '#6366f1' : 'var(--nodeui-dim)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-muted)' }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)' }}
            >
              <Icon size={14} />
            </button>
          )
        })}

        {/* Expand button pinned to bottom */}
        <div style={{ flex: 1 }} />
        <button
          title="Expand sidebar"
          onClick={() => setCollapsed(false)}
          style={{
            width: 32, height: 28, borderRadius: 7, marginBottom: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: '1px solid #2a2a3e',
            color: 'var(--nodeui-dim)', cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-text)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nodeui-dim)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nodeui-border-strong)' }}
        >
          <ChevronRight size={13} />
        </button>
      </div>
    )
  }

  /* ── Expanded panel ── */
  return (
    <div style={{
      width,
      flexShrink: 0,
      background: 'var(--nodeui-surface)',
      borderRight: '1px solid var(--nodeui-border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Tab header */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--nodeui-border-subtle)', flexShrink: 0 }}>
        {TABS.map(({ id, label, Icon }) => {
          const active = mode === id
          return (
            <button
              key={id}
              onClick={() => setMode(id)}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '9px 0',
                fontSize: 11, fontWeight: active ? 700 : 500,
                color: active ? 'var(--nodeui-text)' : 'var(--nodeui-dim)',
                background: 'none', border: 'none',
                borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-muted)' }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)' }}
            >
              <Icon size={11} />
              {label}
            </button>
          )
        })}

        {/* Collapse button */}
        <button
          title="Collapse sidebar"
          onClick={() => setCollapsed(true)}
          style={{
            width: 32, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', borderBottom: '2px solid transparent',
            color: 'var(--nodeui-dim)', cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-text)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)' }}
        >
          <ChevronLeft size={13} />
        </button>
      </div>

      {/* Palette */}
      {mode === 'palette' && (
        <>
          <div style={{ padding: '8px 12px', position: 'relative', flexShrink: 0 }}>
            <Search size={12} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', color: 'var(--nodeui-dim)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search nodes…"
              style={{
                width: '100%', background: 'var(--nodeui-canvas)', border: '1px solid var(--nodeui-border-strong)',
                borderRadius: 6, padding: '5px 8px 5px 24px', fontSize: 11,
                color: 'var(--nodeui-text)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
            {NODE_CATEGORIES.map((group) => (
              <SidebarCategory key={group.category} group={group} query={query} />
            ))}
          </div>
        </>
      )}

      {/* Agent */}
      {mode === 'agent' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ChatPanel />
        </div>
      )}

      {/* Right-edge resize handle */}
      <div
        onMouseDown={onMouseDown}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 4, cursor: 'col-resize', zIndex: 10 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#6366f166' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
      />
    </div>
  )
}
