import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'

const ACCENT = '#94a3b8'

export const ReturnStepNode = memo(function ReturnStepNode({ id, selected }: NodeProps<AppNode>) {
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Terminus"
      label="Return Step"
      wide
      inputs={[
        { id: 'obs-in',        label: 'Observation',      color: '#8b5cf6' },
        { id: 'reward-in',     label: 'Reward (float)',   color: '#f59e0b' },
        { id: 'terminated-in', label: 'Terminated (bool)', color: '#f43f5e' },
        { id: 'truncated-in',  label: 'Truncated (bool)', color: '#f43f5e' },
        { id: 'info-in',       label: 'Info (dict)',      color: '#8b5cf6' },
      ]}
    >
      <span style={{ fontSize: 10, color: 'var(--nodeui-muted)' }}>→ returns (obs, rew, term, trunc, info)</span>
    </BaseNode>
  )
})
