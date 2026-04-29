import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'
import type { StaticRewardData } from '@nodeui/types/nodes'

const ACCENT = '#f43f5e'
const EXEC_COLOR = '#6366f1'

export const StaticRewardNode = memo(function StaticRewardNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as StaticRewardData
  const isPositive = d.reward >= 0
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Evaluation"
      label={d.label}
      inputs={[{ id: 'exec-in', label: 'Exec Flow', color: EXEC_COLOR }]}
      outputs={[{ id: 'exec-out', label: 'Exec + Score', color: '#f59e0b' }]}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: isPositive ? '#10b981' : '#f43f5e' }}>
          {isPositive ? '+' : ''}{d.reward}
        </span>
        {d.description && <span style={{ fontSize: 10, color: 'var(--nodeui-muted)' }}>{d.description}</span>}
      </div>
    </BaseNode>
  )
})
