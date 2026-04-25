import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'
import type { ConstraintData } from '@nodeui/types/nodes'

const ACCENT = '#f43f5e'
const EXEC_COLOR = '#6366f1'

export const ConstraintNode = memo(function ConstraintNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as ConstraintData
  const rule = d.rule ? d.rule.slice(0, 55) + (d.rule.length > 55 ? '…' : '') : 'No rule'
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Evaluation"
      label={d.label}
      inputs={[{ id: 'exec-in', label: 'Exec Flow', color: EXEC_COLOR }]}
      outputs={[
        { id: 'pass-out', label: 'Pass', color: '#10b981' },
        { id: 'violate-out', label: 'Violate', color: '#f43f5e' },
      ]}
    >
      <span style={{ fontSize: 10, color: '#8888aa' }}>{rule}</span>
    </BaseNode>
  )
})
