import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'
import type { LiveApiData } from '@nodeui/types/nodes'

const ACCENT = '#10b981'
const EXEC_COLOR = '#6366f1'

const INTEGRATION_LABELS: Record<string, string> = {
  slack: 'Slack', stripe: 'Stripe', github: 'GitHub', notion: 'Notion', linear: 'Linear',
}

export const LiveApiNode = memo(function LiveApiNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as LiveApiData
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, padding: '2px 6px', background: '#10b98122', color: '#10b981', borderRadius: 4, fontWeight: 700 }}>
          {INTEGRATION_LABELS[d.integration] ?? d.integration}
        </span>
        <span style={{ fontSize: 10, color: 'var(--nodeui-muted)' }}>{d.operation}</span>
      </div>
    </BaseNode>
  )
})
