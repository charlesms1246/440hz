import type { AppNode, AppEdge } from '@nodeui/types/graph'
import { NodeType } from '@nodeui/types/nodes'
import type {
  AnyNodeData,
  ActionSpaceData,
  ObservationSpaceData,
  RlaifOverseerData,
  McpEndpointData,
  HttpsRequestData,
  RouterCondition,
  ExtractionEntry,
  StateEntry,
} from '@nodeui/types/nodes'
import { getNodeDefaults } from '@nodeui/utils/nodeHelpers'

// ── Public types ──────────────────────────────────────────────────

export interface ParsedGraph {
  nodes: AppNode[]
  edges: AppEdge[]
  projectName: string
}

// ── Public entry point ────────────────────────────────────────────

export function parsePythonToGraph(code: string): ParsedGraph | null {
  return tryMetadata(code) ?? buildFromRegex(code)
}

// ── Strategy 1: metadata comment (perfect reconstruction) ─────────

function fromBase64(b64: string): string {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function tryMetadata(code: string): ParsedGraph | null {
  const match = code.match(/^# @440hz-graph: (.+)$/m)
  if (!match) return null
  try {
    const { nodes, edges, projectName } = JSON.parse(fromBase64(match[1].trim()))
    if (Array.isArray(nodes) && Array.isArray(edges)) {
      return { nodes, edges, projectName: projectName ?? 'My Gym Env' }
    }
  } catch {}
  return null
}

// ── Strategy 2: regex extraction (approximate, no metadata) ───────

function buildFromRegex(code: string): ParsedGraph | null {
  let counter = 0
  const mk = (nodeType: NodeType, overrides: Record<string, unknown> = {}): AppNode => ({
    id: `parsed-${nodeType}-${counter++}`,
    type: nodeType,
    position: { x: 0, y: 0 },
    data: { ...getNodeDefaults(nodeType), ...overrides } as AnyNodeData,
  })

  // Class name → projectName ("MyGymEnv" → "My Gym Env")
  const classMatch = code.match(/^class (\w+)\(gym\.Env\)/m)
  const className = classMatch?.[1] ?? 'MyGymEnv'
  const projectName = className.replace(/([a-z])([A-Z])/g, '$1 $2').trim()

  // Space definitions from __init__
  const actMatch = code.match(/self\.action_space = (gym\.spaces\.(\w+)\(([^)]*)\))/m)
  const obsMatch = code.match(/self\.observation_space = (gym\.spaces\.(\w+)\(([^)]*)\))/m)

  const actionSpaceNode = mk(NodeType.ActionSpace, {
    spaceType: (actMatch?.[2] ?? 'Discrete') as ActionSpaceData['spaceType'],
    schema: actMatch?.[3] ?? '{"n": 4}',
  })
  const obsSpaceNode = mk(NodeType.ObservationSpace, {
    spaceType: (obsMatch?.[2] ?? 'Text') as ObservationSpaceData['spaceType'],
    schema: obsMatch?.[3] ?? '',
  })

  // Method bodies
  const resetBody = extractMethodBody(code, 'reset')
  const stepBody  = extractMethodBody(code, 'step')

  // Fixed structural nodes
  const onReset     = mk(NodeType.OnReset,     { label: 'On Reset' })
  const returnReset = mk(NodeType.ReturnReset,  { label: 'Return Reset' })
  const onStep      = mk(NodeType.OnStep,      { label: 'On Step' })
  const returnStep  = mk(NodeType.ReturnStep,   { label: 'Return Step' })

  // Parse flow nodes from method bodies
  const resetInner = extractFlowNodes(resetBody, mk)
  const stepInner  = extractFlowNodes(stepBody,  mk)

  const resetFlow = [onReset, ...resetInner, returnReset]
  const stepFlow  = [onStep,  ...stepInner,  returnStep]
  const configNodes = [actionSpaceNode, obsSpaceNode]

  // Bail if nothing was parseable (e.g. completely unrecognised file)
  if (resetInner.length === 0 && stepInner.length === 0 && !classMatch) return null

  // Assign canvas positions
  autoLayout(configNodes, resetFlow, stepFlow)

  // Build sequential edges
  const edges: AppEdge[] = [...chainEdges(resetFlow), ...chainEdges(stepFlow)]
  const nodes = [...configNodes, ...resetFlow, ...stepFlow]

  return { nodes, edges, projectName }
}

// ── Method body extraction ────────────────────────────────────────

function extractMethodBody(code: string, method: string): string {
  // Match from "def method_name..." up to the next method at the same indent or end of class
  const match = code.match(new RegExp(`    def ${method}\\b[^:]*:([\\s\\S]+?)(?=\\n    def \\w|\\nclass |$)`))
  return match?.[1] ?? ''
}

// ── Node pattern extraction from a method body ────────────────────

type MkFn = (type: NodeType, overrides?: Record<string, unknown>) => AppNode

function extractFlowNodes(body: string, mk: MkFn): AppNode[] {
  const nodes: AppNode[] = []

  // StaticReward: reward += -0.1  # description
  for (const m of body.matchAll(/reward \+= ([-\d.]+)  # (.+)/g)) {
    nodes.push(mk(NodeType.StaticReward, { reward: parseFloat(m[1]), description: m[2].trim() }))
  }

  // GetSetState set: self.state["key"] = ...  # type: string
  for (const m of body.matchAll(/self\.state\["([^"]+)"\] = .+?  # type: (\w+)/g)) {
    nodes.push(mk(NodeType.GetSetState, {
      operation: 'set',
      stateEntries: [{ key: m[1], defaultValue: '', type: m[2] }] as StateEntry[],
    }))
  }

  // GetSetState get: key = self.state.get("key", default)
  for (const m of body.matchAll(/\w+ = self\.state\.get\("([^"]+)", (.+?)\)$/gm)) {
    nodes.push(mk(NodeType.GetSetState, {
      operation: 'get',
      stateEntries: [{ key: m[1], defaultValue: m[2].replace(/^["']|["']$/g, ''), type: 'string' }] as StateEntry[],
    }))
  }

  // Constraint
  for (const m of body.matchAll(/if not _check_constraint\(action, """([\s\S]+?)"""\):\s+reward \+= ([-\d.]+)/g)) {
    nodes.push(mk(NodeType.Constraint, { rule: m[1].trim(), violationReward: parseFloat(m[2]) }))
  }

  // RlaifOverseer
  for (const m of body.matchAll(/_rlaif_score\(\s*model="([^"]+)",[\s\S]+?rubric="""([\s\S]+?)""",\s+api_key_env="([^"]+)"/g)) {
    nodes.push(mk(NodeType.RlaifOverseer, {
      model: m[1] as RlaifOverseerData['model'],
      rubric: m[2].trim(),
      apiKeyEnvVar: m[3],
    }))
  }

  // DataExtractor — group all _jsonpath_extract calls into one node
  const extractions: ExtractionEntry[] = []
  for (const m of body.matchAll(/(\w+) = _jsonpath_extract\(action, "([^"]+)"\)/g)) {
    extractions.push({ key: m[1], jsonPath: m[2] })
  }
  if (extractions.length > 0) nodes.push(mk(NodeType.DataExtractor, { extractions }))

  // McpEndpoint
  for (const m of body.matchAll(/_call_mcp_tool\("([^"]+)", "([^"]+)", action, transport="([^"]+)"\)/g)) {
    nodes.push(mk(NodeType.McpEndpoint, {
      serverUrl: m[1],
      toolName: m[2],
      transportType: m[3] as McpEndpointData['transportType'],
    }))
  }

  // HttpsRequest
  for (const m of body.matchAll(/_resp_\w+ = requests\.(get|post|put|patch|delete)\(\s*f?"([^"]+)"/g)) {
    nodes.push(mk(NodeType.HttpsRequest, {
      method: m[1].toUpperCase() as HttpsRequestData['method'],
      urlTemplate: m[2],
      headers: [],
      bodyTemplate: '',
    }))
  }

  // Documentation
  for (const m of body.matchAll(/# --- Documentation: (.+?) ---\s+_docs_\w+ = """\s*([\s\S]+?)"""/g)) {
    nodes.push(mk(NodeType.Documentation, { title: m[1].trim(), content: m[2].trim() }))
  }

  // RouterSwitch — extract conditions from if/elif block following the Router comment
  for (const m of body.matchAll(/# --- Router: (.+?) ---\n([\s\S]+?)(?=# ---|$)/g)) {
    const conditions: RouterCondition[] = []
    for (const c of m[2].matchAll(/(?:if|elif) (.+?):/g)) {
      conditions.push({
        id: `cond-${conditions.length}`,
        label: `Path ${String.fromCharCode(65 + conditions.length)}`,
        condition: c[1].trim(),
      })
    }
    if (conditions.length > 0) nodes.push(mk(NodeType.RouterSwitch, { conditions }))
  }

  return nodes
}

// ── Auto-layout ───────────────────────────────────────────────────

function autoLayout(configNodes: AppNode[], resetFlow: AppNode[], stepFlow: AppNode[]): void {
  const GAP = 180
  configNodes.forEach((n, i) => { n.position = { x: 50,  y: 50 + i * GAP } })
  resetFlow.forEach((n, i)   => { n.position = { x: 350, y: 50 + i * GAP } })
  stepFlow.forEach((n, i)    => { n.position = { x: 700, y: 50 + i * GAP } })
}

// ── Edge helpers ──────────────────────────────────────────────────

// Primary output handle per node type (for sequential chaining)
function primaryOut(t: NodeType): string {
  switch (t) {
    case NodeType.Constraint:    return 'pass-out'
    case NodeType.RlaifOverseer: return 'scored-out'
    case NodeType.McpEndpoint:   return 'success-out'
    case NodeType.HttpsRequest:  return 'success-out'
    case NodeType.Documentation: return 'context-out'
    default:                     return 'exec-out'
  }
}

// Primary input handle (ReturnReset/ReturnStep have no exec-in)
function primaryIn(t: NodeType): string {
  return (t === NodeType.ReturnReset || t === NodeType.ReturnStep) ? 'obs-in' : 'exec-in'
}

function chainEdges(flow: AppNode[]): AppEdge[] {
  const edges: AppEdge[] = []
  for (let i = 0; i < flow.length - 1; i++) {
    const src = flow[i]
    const tgt = flow[i + 1]
    edges.push({
      id: `e-${src.id}-${tgt.id}`,
      source: src.id,
      target: tgt.id,
      sourceHandle: primaryOut(src.data.nodeType),
      targetHandle: primaryIn(tgt.data.nodeType),
      animated: true,
    })
  }
  return edges
}
