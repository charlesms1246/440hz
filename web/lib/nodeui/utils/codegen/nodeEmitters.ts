import type { AppNode, AppEdge } from '@nodeui/types/graph'
import { NodeType } from '@nodeui/types/nodes'
import type {
  ActionSpaceData, ObservationSpaceData,
  GetSetStateData, HttpsRequestData, LiveApiData, McpEndpointData, MockCliData,
  RouterSwitchData, DataExtractorData,
  ConstraintData, RlaifOverseerData, StaticRewardData,
} from '@nodeui/types/nodes'
import { getDownstreamNodes, type AdjacencyMap } from './graphTraversal'

export function emitSpace(data: ActionSpaceData | ObservationSpaceData): string {
  switch (data.spaceType) {
    case 'Discrete': {
      try { const s = JSON.parse(data.schema || '{"n":2}'); return `gym.spaces.Discrete(${s.n ?? 2})` } catch { return 'gym.spaces.Discrete(2)' }
    }
    case 'Box': {
      try { const s = JSON.parse(data.schema || '{"low":0,"high":1,"shape":[1]}'); return `gym.spaces.Box(low=${s.low}, high=${s.high}, shape=${JSON.stringify(s.shape)}, dtype=np.float32)` } catch { return 'gym.spaces.Box(low=0, high=1, shape=[1], dtype=np.float32)' }
    }
    case 'Text': return 'gym.spaces.Text(max_length=4096)'
    case 'Dict': return `gym.spaces.Dict(${data.schema || '{}'})`
    default: return 'gym.spaces.Discrete(2)'
  }
}

function indent(lines: string[], n = 2): string[] {
  const pad = ' '.repeat(n * 4)
  return lines.map((l) => (l.trim() === '' ? '' : `${pad}${l}`))
}

export function emitNodeSnippet(node: AppNode, allNodes: AppNode[], edges: AppEdge[], adjacency: AdjacencyMap, depth = 2): string[] {
  const { nodeType } = node.data
  const lines: string[] = []

  switch (nodeType) {
    case NodeType.GetSetState: {
      const d = node.data as GetSetStateData
      for (const e of d.stateEntries) {
        if (d.operation === 'get') {
          lines.push(`${e.key} = self.state.get("${e.key}", ${JSON.stringify(e.defaultValue)})`)
        } else {
          lines.push(`self.state["${e.key}"] = ${JSON.stringify(e.defaultValue)}  # type: ${e.type}`)
        }
      }
      break
    }
    case NodeType.Documentation: {
      const d = node.data as { content: string; title: string; nodeType: NodeType }
      lines.push(`# --- Documentation: ${d.title} ---`)
      lines.push(`_docs_${node.id.replace(/-/g, '_')} = """`)
      lines.push(d.content.replace(/"""/g, '\\"\\"\\"'))
      lines.push('"""')
      break
    }
    case NodeType.HttpsRequest: {
      const d = node.data as HttpsRequestData
      const safeId = node.id.replace(/-/g, '_')
      lines.push(`# --- HTTPS ${d.method} ${d.urlTemplate} ---`)
      lines.push(`_resp_${safeId} = requests.${d.method.toLowerCase()}(`)
      lines.push(`    f"${d.urlTemplate.replace(/{{/g, '{').replace(/}}/g, '}')}",`)
      lines.push(`    headers=_HEADERS_${safeId},`)
      if (d.method !== 'GET') lines.push(`    json=action,`)
      lines.push(`)`)
      const successNodes = getDownstreamNodes(node.id, 'success-out', allNodes, edges, adjacency)
      const errorNodes   = getDownstreamNodes(node.id, 'error-out',   allNodes, edges, adjacency)
      lines.push(`if _resp_${safeId}.ok:`)
      if (successNodes.length > 0) {
        for (const sn of successNodes) lines.push(...indent(emitNodeSnippet(sn, allNodes, edges, adjacency, 0), 1))
      } else { lines.push('    pass') }
      lines.push(`else:`)
      if (errorNodes.length > 0) {
        for (const en of errorNodes) lines.push(...indent(emitNodeSnippet(en, allNodes, edges, adjacency, 0), 1))
      } else { lines.push('    pass') }
      break
    }
    case NodeType.MockCli: {
      const d = node.data as MockCliData
      lines.push(`# --- Mock CLI: ${d.commandMatcher} ---`)
      lines.push(`import re as _re`)
      lines.push(`if _re.match(r"${d.commandMatcher}", action.get("command", "")):`)
      lines.push(`    _stdout = """${d.stdout}"""`)
      lines.push(`    _stderr = """${d.stderr}"""`)
      lines.push(`    _exit_code = ${d.exitCode}`)
      break
    }
    case NodeType.LiveApi: {
      const d = node.data as LiveApiData
      lines.push(`# --- Live API: ${d.integration} / ${d.operation} ---`)
      lines.push(`_api_key_${node.id.replace(/-/g, '_')} = os.environ.get("${d.authEnvKey}", "")`)
      lines.push(`# Call ${d.integration}.${d.operation}(api_key=_api_key_..., **action)`)
      break
    }
    case NodeType.McpEndpoint: {
      const d = node.data as McpEndpointData
      lines.push(`# --- MCP Endpoint: ${d.serverUrl} ---`)
      lines.push(`_mcp_result = _call_mcp_tool("${d.serverUrl}", "${d.toolName}", action, transport="${d.transportType}")`)
      break
    }
    case NodeType.RouterSwitch: {
      const d = node.data as RouterSwitchData
      lines.push(`# --- Router: ${node.data.label} ---`)
      d.conditions.forEach((c, i) => {
        const keyword = i === 0 ? 'if' : 'elif'
        const condition = c.condition || 'True'
        lines.push(`${keyword} ${condition}:`)
        const downstreamNodes = getDownstreamNodes(node.id, `out-${c.id}`, allNodes, edges, adjacency)
        if (downstreamNodes.length > 0) {
          for (const dn of downstreamNodes) lines.push(...indent(emitNodeSnippet(dn, allNodes, edges, adjacency, 0), 1))
        } else { lines.push('    pass') }
      })
      lines.push(`else:`)
      lines.push(`    pass`)
      break
    }
    case NodeType.DataExtractor: {
      const d = node.data as DataExtractorData
      for (const e of d.extractions) {
        lines.push(`${e.key} = _jsonpath_extract(action, "${e.jsonPath}")`)
      }
      break
    }
    case NodeType.Constraint: {
      const d = node.data as ConstraintData
      lines.push(`# --- Constraint: ${d.rule.slice(0, 50)} ---`)
      lines.push(`if not _check_constraint(action, """${d.rule}"""):`)
      lines.push(`    reward += ${d.violationReward}`)
      lines.push(`    terminated = True`)
      lines.push(`    return observation, reward, terminated, truncated, info`)
      break
    }
    case NodeType.RlaifOverseer: {
      const d = node.data as RlaifOverseerData
      lines.push(`# --- RLAIF Overseer (${d.model}) ---`)
      lines.push(`_overseer_result = _rlaif_score(`)
      lines.push(`    model="${d.model}",`)
      lines.push(`    action=action,`)
      lines.push(`    state=self.state,`)
      lines.push(`    rubric="""${d.rubric}""",`)
      lines.push(`    api_key_env="${d.apiKeyEnvVar}",`)
      lines.push(`)`)
      lines.push(`reward += _overseer_result["score"]`)
      lines.push(`info["overseer_reasoning"] = _overseer_result["reasoning"]`)
      break
    }
    case NodeType.StaticReward: {
      const d = node.data as StaticRewardData
      lines.push(`reward += ${d.reward}  # ${d.description}`)
      break
    }
    case NodeType.ReturnReset:
    case NodeType.ReturnStep:
    case NodeType.OnReset:
    case NodeType.OnStep:
      break
    default:
      lines.push(`# Node: ${nodeType}`)
  }

  return indent(lines, depth)
}
