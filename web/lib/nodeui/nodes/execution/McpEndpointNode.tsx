import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'
import type { McpEndpointData } from '@nodeui/types/nodes'

const ACCENT = '#10b981'
const EXEC_COLOR = '#6366f1'

export const McpEndpointNode = memo(function McpEndpointNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as McpEndpointData
  const url = d.serverUrl ? d.serverUrl.slice(0, 36) + (d.serverUrl.length > 36 ? '…' : '') : 'No URL'
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Execution"
      label={d.label}
      inputs={[{ id: 'exec-in', label: 'Exec Flow', color: EXEC_COLOR }]}
      outputs={[
        { id: 'success-out', label: 'Success', color: '#10b981' },
        { id: 'error-out', label: 'Error', color: '#f43f5e' },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--nodeui-muted)' }}>{url}</span>
        {d.toolName && <span style={{ fontSize: 10, color: '#14b8a6' }}>tool: {d.toolName}</span>}
      </div>
    </BaseNode>
  )
})
