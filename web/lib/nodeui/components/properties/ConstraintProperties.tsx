import { useGraphStore } from '@nodeui/store/graphStore'
import type { ConstraintData } from '@nodeui/types/nodes'
import { Field, StyledTextarea, StyledInput } from './shared'

export function ConstraintProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as ConstraintData

  return (
    <>
      <Field label="Rule">
        <StyledTextarea value={d.rule} onChange={(v) => update(nodeId, { rule: v })} placeholder="Agent must not call DELETE on /users endpoint" rows={4} />
      </Field>
      <Field label="Violation Reward">
        <StyledInput type="number" value={d.violationReward} onChange={(v) => update(nodeId, { violationReward: Number(v) })} />
      </Field>
    </>
  )
}
