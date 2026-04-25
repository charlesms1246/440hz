import { useGraphStore } from '@nodeui/store/graphStore'
import type { DocumentationData } from '@nodeui/types/nodes'
import { Field, StyledInput, StyledTextarea } from './shared'

export function DocumentationProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as DocumentationData

  return (
    <>
      <Field label="Document Title">
        <StyledInput value={d.title} onChange={(v) => update(nodeId, { title: v })} placeholder="API Docs" />
      </Field>
      <Field label="Content">
        <StyledTextarea value={d.content} onChange={(v) => update(nodeId, { content: v })} placeholder="Paste documentation, API specs, SOPs…" rows={10} />
      </Field>
    </>
  )
}
