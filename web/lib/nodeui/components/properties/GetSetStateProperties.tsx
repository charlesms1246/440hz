import { useGraphStore } from '@nodeui/store/graphStore'
import type { GetSetStateData, StateEntry } from '@nodeui/types/nodes'
import { Field, StyledSelect, StyledInput, AddButton, RemoveButton } from './shared'

const OP_OPTIONS = [
  { value: 'get', label: 'Get' },
  { value: 'set', label: 'Set' },
  { value: 'get_and_set', label: 'Get & Set' },
]

const TYPE_OPTIONS = [
  { value: 'string', label: 'string' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'list', label: 'list' },
]

export function GetSetStateProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as GetSetStateData

  const updateEntry = (idx: number, patch: Partial<StateEntry>) => {
    const entries = d.stateEntries.map((e, i) => i === idx ? { ...e, ...patch } : e)
    update(nodeId, { stateEntries: entries })
  }

  const addEntry = () => {
    update(nodeId, { stateEntries: [...d.stateEntries, { key: '', defaultValue: '', type: 'string' }] })
  }

  const removeEntry = (idx: number) => {
    update(nodeId, { stateEntries: d.stateEntries.filter((_, i) => i !== idx) })
  }

  return (
    <>
      <Field label="Operation">
        <StyledSelect value={d.operation} onChange={(v) => update(nodeId, { operation: v as GetSetStateData['operation'] })} options={OP_OPTIONS} />
      </Field>
      <Field label="State Variables">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {d.stateEntries.map((e, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--nodeui-canvas)', borderRadius: 6, padding: 8, border: '1px solid var(--nodeui-border-subtle)' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <StyledInput value={e.key} onChange={(v) => updateEntry(i, { key: v })} placeholder="variable_name" />
                <RemoveButton onClick={() => removeEntry(i)} />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <StyledSelect value={e.type} onChange={(v) => updateEntry(i, { type: v as StateEntry['type'] })} options={TYPE_OPTIONS} />
                <StyledInput value={e.defaultValue} onChange={(v) => updateEntry(i, { defaultValue: v })} placeholder="default" />
              </div>
            </div>
          ))}
          <AddButton onClick={addEntry} label="+ Add Variable" />
        </div>
      </Field>
    </>
  )
}
