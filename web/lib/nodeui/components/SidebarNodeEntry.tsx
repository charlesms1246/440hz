import { type DragEvent } from 'react'
import type { NodeType } from '@nodeui/types/nodes'

interface Props {
  nodeType: NodeType
  label: string
  description: string
  accentHex: string
}

export function SidebarNodeEntry({ nodeType, label, description, accentHex }: Props) {
  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('nodeType', nodeType)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      title={description}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        borderRadius: 8,
        background: '#1a1a2e',
        border: '1px solid #2a2a3e',
        cursor: 'grab',
        transition: 'border-color 0.1s, background 0.1s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = `${accentHex}55`
        el.style.background = '#1e1e36'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = '#2a2a3e'
        el.style.background = '#1a1a2e'
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: accentHex, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: '#f0f0ff', fontWeight: 500 }}>{label}</span>
    </div>
  )
}
