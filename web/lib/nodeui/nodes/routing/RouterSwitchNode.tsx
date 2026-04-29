import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { useGraphStore } from '@nodeui/store/graphStore'
import type { AppNode } from '@nodeui/types/graph'
import type { RouterSwitchData } from '@nodeui/types/nodes'
import { X } from 'lucide-react'

const ACCENT = '#facc15'
const EXEC_COLOR = '#6366f1'

export const RouterSwitchNode = memo(function RouterSwitchNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as RouterSwitchData
  const { addRouterCondition, removeRouterCondition, removeNode, setSelectedNode } = useGraphStore()
  const total = d.conditions.length

  return (
    <div
      onClick={() => setSelectedNode(id)}
      style={{
        width: 288,
        background: 'var(--nodeui-node)',
        borderRadius: 12,
        border: selected ? `1px solid ${ACCENT}66` : '1px solid var(--nodeui-border-strong)',
        boxShadow: selected ? `0 0 0 2px ${ACCENT}33, 0 4px 24px rgba(0,0,0,0.5)` : '0 4px 24px rgba(0,0,0,0.4)',
        position: 'relative',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
    >
      {/* Header */}
      <div style={{
        background: `linear-gradient(to right, ${ACCENT}22, transparent)`,
        borderBottom: '1px solid var(--nodeui-border-strong)',
        borderRadius: '12px 12px 0 0',
        padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 8, minHeight: 36,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: ACCENT }}>
          Routing
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--nodeui-text)' }}>{d.label}</span>
        <button
          onClick={(e) => { e.stopPropagation(); removeNode(id) }}
          style={{ color: 'var(--nodeui-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f43f5e' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)' }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {d.conditions.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--nodeui-text)', flex: 1 }}>{c.label}</span>
              {d.conditions.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeRouterCondition(id, c.id) }}
                  style={{ color: 'var(--nodeui-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f43f5e' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)' }}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={(e) => { e.stopPropagation(); addRouterCondition(id) }}
            style={{ marginTop: 4, fontSize: 10, color: ACCENT, background: `${ACCENT}11`, border: `1px solid ${ACCENT}33`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer', alignSelf: 'flex-start' }}
          >
            + Add Path
          </button>
        </div>
      </div>

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="exec-in"
        style={{ top: '50%', width: 10, height: 10, background: EXEC_COLOR, border: '2px solid var(--nodeui-node)', borderRadius: '50%' }}
      />
      <span style={{ position: 'absolute', left: -8, top: '50%', transform: 'translate(-100%, -50%)', fontSize: 9, color: 'var(--nodeui-muted)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        Exec Flow
      </span>

      {/* Dynamic output handles */}
      {d.conditions.map((c, i) => {
        const pct = total === 1 ? 50 : 20 + (60 / (total - 1)) * i
        return (
          <div key={c.id}>
            <Handle
              type="source"
              position={Position.Right}
              id={`out-${c.id}`}
              style={{ top: `${pct}%`, width: 10, height: 10, background: ACCENT, border: '2px solid var(--nodeui-node)', borderRadius: '50%' }}
            />
            <span style={{ position: 'absolute', right: -8, top: `${pct}%`, transform: 'translate(100%, -50%)', fontSize: 9, color: 'var(--nodeui-muted)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
              {c.label}
            </span>
          </div>
        )
      })}
    </div>
  )
})
