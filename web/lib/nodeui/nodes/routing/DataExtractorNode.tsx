import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from '../BaseNode'
import type { AppNode } from '@nodeui/types/graph'
import type { DataExtractorData } from '@nodeui/types/nodes'

const ACCENT = '#facc15'
const EXEC_COLOR = '#6366f1'

export const DataExtractorNode = memo(function DataExtractorNode({ id, selected, data }: NodeProps<AppNode>) {
  const d = data as DataExtractorData
  const first = d.extractions[0]
  return (
    <BaseNode
      id={id}
      selected={selected}
      accentHex={ACCENT}
      categoryLabel="Routing"
      label={d.label}
      inputs={[{ id: 'exec-in', label: 'Exec Flow', color: EXEC_COLOR }]}
      outputs={[{ id: 'exec-out', label: 'Exec + Vars', color: EXEC_COLOR }]}
    >
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#facc15' }}>
        {first ? `${first.key}: ${first.jsonPath}` : 'No extractions'}
        {d.extractions.length > 1 && <span style={{ color: '#8888aa' }}> +{d.extractions.length - 1}</span>}
      </span>
    </BaseNode>
  )
})
