import { useGraphStore } from '@nodeui/store/graphStore'
import type { ObservationSpaceData } from '@nodeui/types/nodes'
import { Field, StyledSelect, StyledTextarea } from './shared'

const SPACE_OPTIONS = [
  { value: 'Discrete', label: 'Discrete' },
  { value: 'Box', label: 'Box' },
  { value: 'Dict', label: 'Dict' },
  { value: 'Text', label: 'Text' },
]

export function ObservationSpaceProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as ObservationSpaceData

  return (
    <>
      <Field label="Space Type">
        <StyledSelect value={d.spaceType} onChange={(v) => update(nodeId, { spaceType: v as ObservationSpaceData['spaceType'] })} options={SPACE_OPTIONS} />
      </Field>
      <Field label="Schema / Config">
        <StyledTextarea value={d.schema} onChange={(v) => update(nodeId, { schema: v })} placeholder="Optional schema config" rows={4} />
      </Field>
    </>
  )
}
