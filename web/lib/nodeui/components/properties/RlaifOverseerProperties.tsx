import { useGraphStore } from '@nodeui/store/graphStore'
import type { RlaifOverseerData } from '@nodeui/types/nodes'
import { Field, StyledSelect, StyledTextarea, StyledInput } from './shared'

const MODEL_OPTIONS = [
  { value: 'mistral-small', label: 'Mistral Small' },
  { value: 'mimo-v2-flash', label: 'MiMo v2 Flash' },
  { value: 'gpt-4o-mini',   label: 'GPT-4o Mini' },
  { value: 'claude-haiku',  label: 'Claude Haiku' },
]

export function RlaifOverseerProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as RlaifOverseerData

  return (
    <>
      <Field label="Overseer Model">
        <StyledSelect value={d.model} onChange={(v) => update(nodeId, { model: v as RlaifOverseerData['model'] })} options={MODEL_OPTIONS} />
      </Field>
      <Field label="Rubric / Grading Criteria">
        <StyledTextarea value={d.rubric} onChange={(v) => update(nodeId, { rubric: v })} placeholder="Score the agent's action from 0–10 based on…" rows={8} />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Field label="Min Score">
            <StyledInput type="number" value={d.minScore} onChange={(v) => update(nodeId, { minScore: Number(v) })} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Max Score">
            <StyledInput type="number" value={d.maxScore} onChange={(v) => update(nodeId, { maxScore: Number(v) })} />
          </Field>
        </div>
      </div>
      <Field label="API Key Env Var">
        <StyledInput value={d.apiKeyEnvVar} onChange={(v) => update(nodeId, { apiKeyEnvVar: v })} placeholder="OPENAI_API_KEY" />
      </Field>
    </>
  )
}
