import { useGraphStore } from '@nodeui/store/graphStore'
import type { HttpsRequestData, HeaderEntry } from '@nodeui/types/nodes'
import { Field, StyledSelect, StyledInput, StyledTextarea, AddButton, RemoveButton } from './shared'

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }))

export function HttpsRequestProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as HttpsRequestData

  const updateHeader = (idx: number, patch: Partial<HeaderEntry>) => {
    const headers = d.headers.map((h, i) => i === idx ? { ...h, ...patch } : h)
    update(nodeId, { headers })
  }

  return (
    <>
      <Field label="Method">
        <StyledSelect value={d.method} onChange={(v) => update(nodeId, { method: v as HttpsRequestData['method'] })} options={METHOD_OPTIONS} />
      </Field>
      <Field label="URL Template">
        <StyledInput value={d.urlTemplate} onChange={(v) => update(nodeId, { urlTemplate: v })} placeholder="https://api.example.com/{{action.endpoint}}" />
      </Field>
      <Field label="Headers">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {d.headers.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <StyledInput value={h.key} onChange={(v) => updateHeader(i, { key: v })} placeholder="Header-Name" />
              <StyledInput value={h.value} onChange={(v) => updateHeader(i, { value: v })} placeholder="ENV_VAR_NAME" />
              <RemoveButton onClick={() => update(nodeId, { headers: d.headers.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <AddButton onClick={() => update(nodeId, { headers: [...d.headers, { key: '', value: '' }] })} label="+ Add Header" />
        </div>
      </Field>
      <Field label="Body Template (JSON)">
        <StyledTextarea value={d.bodyTemplate} onChange={(v) => update(nodeId, { bodyTemplate: v })} placeholder='{"query": "{{action.query}}"}' rows={5} />
      </Field>
    </>
  )
}
