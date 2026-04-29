import type { AppNode, AppEdge } from '@nodeui/types/graph'
import { NodeType } from '@nodeui/types/nodes'
import type { ActionSpaceData, ObservationSpaceData, HttpsRequestData } from '@nodeui/types/nodes'
import { buildAdjacency, traverseExecFlow } from './graphTraversal'
import { emitSpace, emitNodeSnippet } from './nodeEmitters'
import { classTemplate } from './templates'

function toClassName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('') || 'MyGymEnv'
}

export function generatePython(nodes: AppNode[], edges: AppEdge[], projectName: string): string {
  const adjacency = buildAdjacency(edges)

  const actionSpaceNode  = nodes.find((n) => n.data.nodeType === NodeType.ActionSpace)
  const obsSpaceNode     = nodes.find((n) => n.data.nodeType === NodeType.ObservationSpace)
  const onResetNode      = nodes.find((n) => n.data.nodeType === NodeType.OnReset)
  const onStepNode       = nodes.find((n) => n.data.nodeType === NodeType.OnStep)

  const actionSpaceCode = actionSpaceNode
    ? emitSpace(actionSpaceNode.data as ActionSpaceData)
    : 'gym.spaces.Discrete(2)'
  const obsSpaceCode = obsSpaceNode
    ? emitSpace(obsSpaceNode.data as ObservationSpaceData)
    : 'gym.spaces.Text(max_length=4096)'

  const resetFlow = onResetNode ? traverseExecFlow(onResetNode.id, nodes, adjacency).slice(1) : []
  const stepFlow  = onStepNode  ? traverseExecFlow(onStepNode.id,  nodes, adjacency).slice(1) : []

  const resetBody = resetFlow
    .filter((n) => n.data.nodeType !== NodeType.ReturnReset && n.data.nodeType !== NodeType.RouterSwitch)
    .flatMap((n) => emitNodeSnippet(n, nodes, edges, adjacency))
    .join('\n')

  const stepBody = stepFlow
    .filter((n) => n.data.nodeType !== NodeType.ReturnStep)
    .flatMap((n) => emitNodeSnippet(n, nodes, edges, adjacency))
    .join('\n')

  const httpsNodes = nodes.filter((n) => n.data.nodeType === NodeType.HttpsRequest)
  const httpsHeaders = httpsNodes.map((n) => {
    const d = n.data as HttpsRequestData
    const safeId = n.id.replace(/-/g, '_')
    const headerDict = d.headers.map((h) => `"${h.key}": os.environ.get("${h.value}", "")`).join(', ')
    return `_HEADERS_${safeId} = {${headerDict}}`
  }).join('\n')

  const code = classTemplate({
    className: toClassName(projectName),
    actionSpaceCode,
    obsSpaceCode,
    resetBody: resetBody || '        pass',
    stepBody:  stepBody  || '        pass',
    httpsHeaders,
  })

  // Embed graph JSON so the reverse parser can reconstruct perfectly (Unicode-safe)
  const json = JSON.stringify({ nodes, edges, projectName })
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  bytes.forEach(b => (binary += String.fromCharCode(b)))
  const meta = btoa(binary)
  return `# @440hz-graph: ${meta}\n${code}`
}
