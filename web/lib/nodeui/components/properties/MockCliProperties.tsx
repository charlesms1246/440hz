import { useGraphStore } from '@nodeui/store/graphStore'
import type { MockCliData } from '@nodeui/types/nodes'
import { Field, StyledInput, StyledTextarea } from './shared'

export function MockCliProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as MockCliData

  return (
    <>
      <Field label="Command Matcher (regex)">
        <StyledInput value={d.commandMatcher} onChange={(v) => update(nodeId, { commandMatcher: v })} placeholder="^ls.*" />
      </Field>
      <Field label="stdout">
        <StyledTextarea value={d.stdout} onChange={(v) => update(nodeId, { stdout: v })} placeholder="Mocked stdout output…" rows={4} />
      </Field>
      <Field label="stderr">
        <StyledTextarea value={d.stderr} onChange={(v) => update(nodeId, { stderr: v })} placeholder="Mocked stderr output…" rows={2} />
      </Field>
      <Field label="Exit Code">
        <StyledInput type="number" value={d.exitCode} onChange={(v) => update(nodeId, { exitCode: Number(v) })} />
      </Field>
    </>
  )
}
