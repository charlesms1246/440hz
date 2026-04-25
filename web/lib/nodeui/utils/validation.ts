import type { AppNode, AppEdge } from '@nodeui/types/graph'
import { NodeType } from '@nodeui/types/nodes'

export interface ValidationError {
  severity: 'error' | 'warning'
  message: string
}

export function validateGraph(nodes: AppNode[], edges: AppEdge[]): ValidationError[] {
  const errors: ValidationError[] = []
  const types = nodes.map((n) => n.data.nodeType)

  if (!types.includes(NodeType.OnReset))
    errors.push({ severity: 'error', message: 'Missing On Reset trigger node' })
  if (!types.includes(NodeType.OnStep))
    errors.push({ severity: 'error', message: 'Missing On Step trigger node' })
  if (!types.includes(NodeType.ReturnReset))
    errors.push({ severity: 'warning', message: 'Missing Return Reset terminus node' })

  if (nodes.filter((n) => n.data.nodeType === NodeType.OnReset).length > 1)
    errors.push({ severity: 'error', message: 'Only one On Reset node is allowed' })
  if (nodes.filter((n) => n.data.nodeType === NodeType.OnStep).length > 1)
    errors.push({ severity: 'error', message: 'Only one On Step node is allowed' })

  const returnStepNodes = nodes.filter((n) => n.data.nodeType === NodeType.ReturnStep)
  for (const rsn of returnStepNodes) {
    const requiredHandles = ['obs-in', 'reward-in', 'terminated-in', 'truncated-in']
    for (const h of requiredHandles) {
      const connected = edges.some((e) => e.target === rsn.id && e.targetHandle === h)
      if (!connected)
        errors.push({ severity: 'warning', message: `Return Step "${rsn.data.label}" missing connection to "${h}"` })
    }
  }

  return errors
}
