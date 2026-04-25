import { useGraphStore } from '@nodeui/store/graphStore'
import type { StaticRewardData } from '@nodeui/types/nodes'
import { Field, StyledInput } from './shared'

export function StaticRewardProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as StaticRewardData

  return (
    <>
      <Field label="Reward Value">
        <StyledInput type="number" value={d.reward} onChange={(v) => update(nodeId, { reward: Number(v) })} />
      </Field>
      <Field label="Description">
        <StyledInput value={d.description} onChange={(v) => update(nodeId, { description: v })} placeholder="step penalty" />
      </Field>
    </>
  )
}
