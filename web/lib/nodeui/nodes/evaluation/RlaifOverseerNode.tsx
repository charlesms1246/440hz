import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'
import type { RlaifOverseerData } from '@nodeui/types/nodes'

const ACCENT = '#f43f5e'
const EXEC_COLOR = '#6366f1'

export const RlaifOverseerNode = memo(function RlaifOverseerNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as RlaifOverseerData
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Evaluation"
      label={d.label}
      wide
      inputs={[
        { id: 'exec-in',    label: 'Exec Flow',      color: EXEC_COLOR },
        { id: 'payload-in', label: 'Action + State', color: '#8b5cf6' },
        { id: 'rubric-in',  label: 'Rubric / Docs',  color: '#8b5cf6' },
      ]}
      outputs={[{ id: 'scored-out', label: 'Exec + Score', color: '#f59e0b' }]}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, padding: '2px 8px', background: '#f43f5e22', color: '#f43f5e', borderRadius: 4, fontWeight: 700 }}>
          {d.model}
        </span>
        <span style={{ fontSize: 10, color: 'var(--nodeui-muted)' }}>{d.minScore}–{d.maxScore} pts</span>
      </div>
    </BaseNode>
  )
})
