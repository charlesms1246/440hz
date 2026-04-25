import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'
import type { MockCliData } from '@nodeui/types/nodes'

const ACCENT = '#10b981'
const EXEC_COLOR = '#6366f1'

export const MockCliNode = memo(function MockCliNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as MockCliData
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Execution"
      label={d.label}
      inputs={[{ id: 'exec-in', label: 'Exec Flow', color: EXEC_COLOR }]}
      outputs={[{ id: 'exec-out', label: 'Exec + stdout', color: EXEC_COLOR }]}
    >
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#14b8a6' }}>
        /{d.commandMatcher || '.*'}/
      </span>
    </BaseNode>
  )
})
