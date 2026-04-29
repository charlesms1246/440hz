import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'
import type { DocumentationData } from '@nodeui/types/nodes'

const ACCENT = '#a855f7'
const EXEC_COLOR = '#6366f1'

export const DocumentationNode = memo(function DocumentationNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as DocumentationData
  const preview = d.content ? d.content.slice(0, 60) + (d.content.length > 60 ? '…' : '') : 'No content'
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Context"
      label={d.label}
      inputs={[{ id: 'exec-in', label: 'Exec (opt.)', color: EXEC_COLOR }]}
      outputs={[{ id: 'context-out', label: 'Context String', color: '#8b5cf6' }]}
    >
      <div style={{ fontSize: 10, color: 'var(--nodeui-muted)', fontStyle: d.content ? 'normal' : 'italic' }}>
        {preview}
      </div>
    </BaseNode>
  )
})
