import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'
import type { ActionSpaceData } from '@nodeui/types/nodes'

const ACCENT = '#3b82f6'

export const ActionSpaceNode = memo(function ActionSpaceNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as ActionSpaceData
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Config"
      label={d.label}
      outputs={[{ id: 'space-out', label: 'Space Def', color: '#8b5cf6' }]}
    >
      <span style={{ fontSize: 10, padding: '2px 8px', background: '#3b82f622', color: '#3b82f6', borderRadius: 4, fontWeight: 600 }}>
        {d.spaceType}
      </span>
    </BaseNode>
  )
})
