import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'
import type { HttpsRequestData } from '@nodeui/types/nodes'

const ACCENT = '#10b981'
const EXEC_COLOR = '#6366f1'

const METHOD_COLORS: Record<string, string> = {
  GET: '#3b82f6', POST: '#10b981', PUT: '#f59e0b', PATCH: '#a855f7', DELETE: '#f43f5e',
}

export const HttpsRequestNode = memo(function HttpsRequestNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as HttpsRequestData
  const url = d.urlTemplate ? d.urlTemplate.slice(0, 40) + (d.urlTemplate.length > 40 ? '…' : '') : 'No URL'
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Execution"
      label={d.label}
      inputs={[{ id: 'exec-in', label: 'Exec Flow', color: EXEC_COLOR }]}
      outputs={[
        { id: 'success-out', label: '2xx Success', color: '#10b981' },
        { id: 'error-out', label: '4xx/5xx Error', color: '#f43f5e' },
      ]}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, padding: '2px 6px', background: `${METHOD_COLORS[d.method]}22`, color: METHOD_COLORS[d.method], borderRadius: 4, fontWeight: 700 }}>
          {d.method}
        </span>
        <span style={{ fontSize: 10, color: '#8888aa' }}>{url}</span>
      </div>
    </BaseNode>
  )
})
