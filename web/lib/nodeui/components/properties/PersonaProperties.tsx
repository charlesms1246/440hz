import { useGraphStore } from '@nodeui/store/graphStore'
import type { PersonaData } from '@nodeui/types/nodes'
import { Field, StyledTextarea } from './shared'

export function PersonaProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as PersonaData

  return (
    <Field label="System Prompt">
      <StyledTextarea value={d.systemPrompt} onChange={(v) => update(nodeId, { systemPrompt: v })} placeholder="You are a helpful assistant…" rows={10} />
    </Field>
  )
}
