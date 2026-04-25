import { useGraphStore } from '@nodeui/store/graphStore'
import type { McpEndpointData } from '@nodeui/types/nodes'
import { Field, StyledInput, StyledSelect } from './shared'

const TRANSPORT_OPTIONS = [
  { value: 'http', label: 'HTTP' },
  { value: 'sse',  label: 'SSE' },
  { value: 'stdio', label: 'stdio' },
]

export function McpEndpointProperties({ nodeId }: { nodeId: string }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))
  const update = useGraphStore((s) => s.updateNodeData)
  if (!node) return null
  const d = node.data as McpEndpointData

  return (
    <>
      <Field label="Server URL">
        <StyledInput value={d.serverUrl} onChange={(v) => update(nodeId, { serverUrl: v })} placeholder="https://mcp.example.com" />
      </Field>
      <Field label="Tool Name">
        <StyledInput value={d.toolName} onChange={(v) => update(nodeId, { toolName: v })} placeholder="search_database" />
      </Field>
      <Field label="Transport">
        <StyledSelect value={d.transportType} onChange={(v) => update(nodeId, { transportType: v as McpEndpointData['transportType'] })} options={TRANSPORT_OPTIONS} />
      </Field>
    </>
  )
}
