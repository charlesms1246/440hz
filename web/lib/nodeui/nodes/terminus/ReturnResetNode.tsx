import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'

const ACCENT = '#94a3b8'

export const ReturnResetNode = memo(function ReturnResetNode({ id, selected }: NodeProps<AppNode>) {
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Terminus"
      label="Return Reset"
      inputs={[
        { id: 'obs-in',  label: 'Observation', color: '#8b5cf6' },
        { id: 'info-in', label: 'Info (dict)', color: '#8b5cf6' },
      ]}
    >
      <span style={{ fontSize: 10, color: '#8888aa' }}>→ returns (obs, info)</span>
    </BaseNode>
  )
})
