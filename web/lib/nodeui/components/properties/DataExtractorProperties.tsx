import { useGraphStore } from '@nodeui/store/graphStore'
import type { DataExtractorData, ExtractionEntry } from '@nodeui/types/nodes'
import { Field, StyledInput, AddButton, RemoveButton } from './shared'

export function DataExtractorProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as DataExtractorData

  const updateEntry = (idx: number, patch: Partial<ExtractionEntry>) => {
    update(nodeId, { extractions: d.extractions.map((e, i) => i === idx ? { ...e, ...patch } : e) })
  }

  return (
    <Field label="Extractions">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {d.extractions.map((e, i) => (
          <div key={i} style={{ background: 'var(--nodeui-canvas)', borderRadius: 6, padding: 8, border: '1px solid var(--nodeui-border-subtle)' }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <StyledInput value={e.key} onChange={(v) => updateEntry(i, { key: v })} placeholder="variable_name" />
              <RemoveButton onClick={() => update(nodeId, { extractions: d.extractions.filter((_, j) => j !== i) })} />
            </div>
            <StyledInput value={e.jsonPath} onChange={(v) => updateEntry(i, { jsonPath: v })} placeholder="$.tool_calls[0].name" />
          </div>
        ))}
        <AddButton onClick={() => update(nodeId, { extractions: [...d.extractions, { key: '', jsonPath: '$.' }] })} label="+ Add Extraction" />
      </div>
    </Field>
  )
}
