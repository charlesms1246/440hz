import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { SidebarNodeEntry } from './SidebarNodeEntry'
import type { CategoryGroup } from '@nodeui/nodes/registry'

interface Props {
  group: CategoryGroup
  query: string
}

export function SidebarCategory({ group, query }: Props) {
  const [open, setOpen] = useState(true)

  const filtered = query
    ? group.nodes.filter((n) =>
        n.label.toLowerCase().includes(query.toLowerCase()) ||
        n.description.toLowerCase().includes(query.toLowerCase())
      )
    : group.nodes

  if (query && filtered.length === 0) return null

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 0',
          marginBottom: 6,
          borderLeft: `2px solid ${group.accentHex}`,
          paddingLeft: 8,
        }}
      >
        {open ? <ChevronDown size={12} color="#8888aa" /> : <ChevronRight size={12} color="#8888aa" />}
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: group.accentHex }}>
          {group.label}
        </span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map((n) => (
            <SidebarNodeEntry
              key={n.type}
              nodeType={n.type}
              label={n.label}
              description={n.description}
              accentHex={n.accentHex}
            />
          ))}
        </div>
      )}
    </div>
  )
}
