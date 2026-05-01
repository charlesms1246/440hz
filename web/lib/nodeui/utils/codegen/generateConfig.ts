import type { AppNode } from '@nodeui/types/graph'
import { NodeType } from '@nodeui/types/nodes'
import type { RlaifOverseerData, ConstraintData, McpEndpointData, LiveApiData } from '@nodeui/types/nodes'

export function generateConfigAndRequirements(nodes: AppNode[]): {
  yaml: string
  requirements: string
} {
  const types = new Set(nodes.map((n) => n.data.nodeType as NodeType))

  const hasHttps    = types.has(NodeType.HttpsRequest)
  const hasMcp      = types.has(NodeType.McpEndpoint)
  const hasRlaif    = types.has(NodeType.RlaifOverseer)
  const hasExtract  = types.has(NodeType.DataExtractor)
  const hasLiveApi  = types.has(NodeType.LiveApi)
  const hasConstraint = types.has(NodeType.Constraint)

  // ── Requirements ─────────────────────────────────────────────
  const reqs: string[] = ['gymnasium>=0.26', 'numpy']
  if (hasHttps)    reqs.push('requests')
  if (hasLiveApi)  reqs.push('httpx')
  if (hasMcp)      reqs.push('mcp>=1.0')
  if (hasExtract)  reqs.push('jsonpath-ng')
  if (hasRlaif) {
    reqs.push('openai>=1.0')
    for (const n of nodes) {
      if (n.data.nodeType !== NodeType.RlaifOverseer) continue
      const d = n.data as RlaifOverseerData
      if (d.model === 'claude-haiku') reqs.push('anthropic>=0.25')
    }
  }

  // ── YAML ─────────────────────────────────────────────────────
  const lines: string[] = []

  lines.push('environment:')
  lines.push('  name: gym-env')
  lines.push('  max_steps: 512')
  lines.push('  seed: 42')
  lines.push('')
  lines.push('training:')
  lines.push('  algorithm: grpo')
  lines.push('  epochs: 3')
  lines.push('  batch_size: 8')
  lines.push('  learning_rate: 1.0e-4')

  if (hasRlaif) {
    const rlaifNodes = nodes.filter((n) => n.data.nodeType === NodeType.RlaifOverseer)
    const first = rlaifNodes[0]?.data as RlaifOverseerData | undefined
    lines.push('')
    lines.push('supervisor:')
    lines.push(`  model: ${first?.model ?? 'gpt-4o-mini'}`)
    lines.push(`  api_key_env: ${first?.apiKeyEnvVar ?? 'OPENAI_API_KEY'}`)
    lines.push(`  min_score: ${first?.minScore ?? 0}`)
    lines.push(`  max_score: ${first?.maxScore ?? 10}`)
  }

  if (hasConstraint) {
    const constraintNodes = nodes.filter((n) => n.data.nodeType === NodeType.Constraint)
    lines.push('')
    lines.push('constraints:')
    for (const cn of constraintNodes) {
      const d = cn.data as ConstraintData
      lines.push(`  - rule: "${d.rule}"`)
      lines.push(`    violation_reward: ${d.violationReward}`)
    }
  }

  if (hasMcp) {
    const mcpNodes = nodes.filter((n) => n.data.nodeType === NodeType.McpEndpoint)
    lines.push('')
    lines.push('mcp_servers:')
    for (const mn of mcpNodes) {
      const d = mn.data as McpEndpointData
      lines.push(`  - url: "${d.serverUrl}"`)
      lines.push(`    transport: ${d.transportType}`)
    }
  }

  if (hasLiveApi) {
    const liveNodes = nodes.filter((n) => n.data.nodeType === NodeType.LiveApi)
    const integrations = [...new Set(liveNodes.map((n) => (n.data as LiveApiData).integration))]
    lines.push('')
    lines.push('integrations:')
    for (const intg of integrations) {
      lines.push(`  - ${intg}`)
    }
  }

  lines.push('')
  lines.push('reward:')
  lines.push('  syntax_pass: 1.0')
  lines.push('  test_pass: 3.0')
  lines.push('  syntax_error_penalty: -0.5')
  lines.push('  crash_penalty: -2.0')
  lines.push('')
  lines.push('output:')
  lines.push('  storage: 0g')
  lines.push('  adapter_format: lora')
  lines.push('')

  return {
    yaml: lines.join('\n'),
    requirements: reqs.join('\n') + '\n',
  }
}
