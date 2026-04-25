import { memo, type CSSProperties, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { X } from 'lucide-react'
import { useGraphStore } from '@nodeui/store/graphStore'

export interface HandleDef {
  id: string
  label: string
  color: string
}

interface BaseNodeProps {
  id: string
  selected: boolean
  accentHex: string
  categoryLabel: string
  label: string
  children?: ReactNode
  inputs?: HandleDef[]
  outputs?: HandleDef[]
  wide?: boolean
}

function getHandleStyle(index: number, total: number, color: string): CSSProperties {
  const pct = total === 1 ? 50 : 20 + (60 / (total - 1)) * index
  return {
    top: `${pct}%`,
    width: 10,
    height: 10,
    background: color,
    border: '2px solid #1a1a2e',
    borderRadius: '50%',
    cursor: 'crosshair',
  }
}

export const BaseNode = memo(function BaseNode({
  id,
  selected,
  accentHex,
  categoryLabel,
  label,
  children,
  inputs = [],
  outputs = [],
  wide = false,
}: BaseNodeProps) {
  const removeNode = useGraphStore((s) => s.removeNode)
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode)

  return (
    <div
      onClick={() => setSelectedNode(id)}
      style={{
        width: wide ? 288 : 240,
        background: '#1a1a2e',
        borderRadius: 12,
        border: selected ? `1px solid ${accentHex}66` : '1px solid #2a2a3e',
        boxShadow: selected
          ? `0 0 0 2px ${accentHex}33, 0 4px 24px rgba(0,0,0,0.5)`
          : '0 4px 24px rgba(0,0,0,0.4)',
        position: 'relative',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(to right, ${accentHex}22, transparent)`,
          borderBottom: '1px solid #2a2a3e',
          borderRadius: '12px 12px 0 0',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 36,
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentHex, flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: accentHex }}>
          {categoryLabel}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#f0f0ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
          {label}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); removeNode(id) }}
          style={{ color: '#4a4a6a', background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1, flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f43f5e' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#4a4a6a' }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px', minHeight: 40, position: 'relative' }}>
        {children}
      </div>

      {/* Input handles */}
      {inputs.map((h, i) => (
        <div key={h.id}>
          <Handle
            type="target"
            position={Position.Left}
            id={h.id}
            style={getHandleStyle(i, inputs.length, h.color)}
          />
          <span style={{
            position: 'absolute',
            left: -8,
            top: `${inputs.length === 1 ? 50 : 20 + (60 / (inputs.length - 1)) * i}%`,
            transform: 'translate(-100%, -50%)',
            fontSize: 9,
            color: '#8888aa',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            {h.label}
          </span>
        </div>
      ))}

      {/* Output handles */}
      {outputs.map((h, i) => (
        <div key={h.id}>
          <Handle
            type="source"
            position={Position.Right}
            id={h.id}
            style={getHandleStyle(i, outputs.length, h.color)}
          />
          <span style={{
            position: 'absolute',
            right: -8,
            top: `${outputs.length === 1 ? 50 : 20 + (60 / (outputs.length - 1)) * i}%`,
            transform: 'translate(100%, -50%)',
            fontSize: 9,
            color: '#8888aa',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            {h.label}
          </span>
        </div>
      ))}
    </div>
  )
})
