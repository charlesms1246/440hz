import { useGraphStore } from '@nodeui/store/graphStore'
import type { RouterSwitchData } from '@nodeui/types/nodes'
import { Field, StyledInput, AddButton, RemoveButton } from './shared'

export function RouterSwitchProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  const addCond = useGraphStore((s) => s.addRouterCondition)
  const removeCond = useGraphStore((s) => s.removeRouterCondition)
  if (!node) return null
  const d = node.data as RouterSwitchData

  const updateCond = (id: string, key: 'label' | 'condition', val: string) => {
    update(nodeId, {
      conditions: d.conditions.map((c) => c.id === id ? { ...c, [key]: val } : c),
    })
  }

  return (
    <Field label="Conditions">
      <div style={{ fontSize: 10, color: '#8888aa', marginBottom: 8 }}>
        Use Python expressions. Available vars: <code style={{ color: '#facc15' }}>action</code>, <code style={{ color: '#facc15' }}>state</code>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {d.conditions.map((c) => (
          <div key={c.id} style={{ background: '#0d0d1a', borderRadius: 6, padding: 8, border: '1px solid #1e1e3a' }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <StyledInput value={c.label} onChange={(v) => updateCond(c.id, 'label', v)} placeholder="Path A" />
              {d.conditions.length > 1 && <RemoveButton onClick={() => removeCond(nodeId, c.id)} />}
            </div>
            <StyledInput value={c.condition} onChange={(v) => updateCond(c.id, 'condition', v)} placeholder='action.get("tool") == "query_db"' />
          </div>
        ))}
        <AddButton onClick={() => addCond(nodeId)} label="+ Add Path" />
      </div>
    </Field>
  )
}
