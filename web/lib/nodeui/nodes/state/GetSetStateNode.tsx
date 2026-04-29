import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'
import type { GetSetStateData } from '@nodeui/types/nodes'

const ACCENT = '#14b8a6'
const EXEC_COLOR = '#6366f1'

export const GetSetStateNode = memo(function GetSetStateNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as GetSetStateData
  const opLabel = d.operation === 'get_and_set' ? 'GET+SET' : d.operation.toUpperCase()
  const firstKey = d.stateEntries[0]?.key ?? '—'
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="State"
      label={d.label}
      inputs={[{ id: 'exec-in', label: 'Exec Flow', color: EXEC_COLOR }]}
      outputs={[{ id: 'exec-out', label: 'Exec + State', color: EXEC_COLOR }]}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, padding: '2px 6px', background: '#14b8a622', color: '#14b8a6', borderRadius: 4, fontWeight: 700 }}>
          {opLabel}
        </span>
        <span style={{ fontSize: 10, color: 'var(--nodeui-muted)' }}>{firstKey}{d.stateEntries.length > 1 ? ` +${d.stateEntries.length - 1}` : ''}</span>
      </div>
    </BaseNode>
  )
})
