import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'
import type { PersonaData } from '@nodeui/types/nodes'

const ACCENT = '#a855f7'

export const PersonaNode = memo(function PersonaNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as PersonaData
  const preview = d.systemPrompt ? d.systemPrompt.slice(0, 60) + (d.systemPrompt.length > 60 ? '…' : '') : 'No prompt'
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Context"
      label={d.label}
      outputs={[{ id: 'prompt-out', label: 'Prompt String', color: '#8b5cf6' }]}
    >
      <div style={{ fontSize: 10, color: 'var(--nodeui-muted)', fontStyle: d.systemPrompt ? 'normal' : 'italic' }}>
        {preview}
      </div>
    </BaseNode>
  )
})
