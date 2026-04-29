import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'

const ACCENT = '#f59e0b'
const EXEC_COLOR = '#6366f1'

export const OnStepNode = memo(function OnStepNode({ id, selected }: NodeProps<AppNode>) {
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Trigger"
      label="On Step"
      outputs={[{ id: 'exec-out', label: 'Exec + Action', color: EXEC_COLOR }]}
    >
      <span style={{ fontSize: 10, color: 'var(--nodeui-muted)' }}>env.step(action) entry point</span>
    </BaseNode>
  )
})
