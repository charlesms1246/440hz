import { useGraphStore } from '@nodeui/store/graphStore'
import type { ActionSpaceData } from '@nodeui/types/nodes'
import { Field, StyledSelect, StyledTextarea } from './shared'

const SPACE_OPTIONS = [
  { value: 'Discrete', label: 'Discrete' },
  { value: 'Box', label: 'Box' },
  { value: 'Dict', label: 'Dict' },
  { value: 'Text', label: 'Text' },
]

export function ActionSpaceProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as ActionSpaceData

  return (
    <>
      <Field label="Space Type">
        <StyledSelect value={d.spaceType} onChange={(v) => update(nodeId, { spaceType: v as ActionSpaceData['spaceType'] })} options={SPACE_OPTIONS} />
      </Field>
      <Field label="Schema / Config">
        <StyledTextarea
          value={d.schema}
          onChange={(v) => update(nodeId, { schema: v })}
          placeholder='e.g. {"n": 4} for Discrete'
          rows={4}
        />
      </Field>
    </>
  )
}
