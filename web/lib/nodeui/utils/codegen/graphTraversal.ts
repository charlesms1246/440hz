import type { AppNode, AppEdge } from '@nodeui/types/graph'

export interface AdjacencyEntry { targetId: string; sourceHandle: string; targetHandle: string }
export type AdjacencyMap = Record<string, AdjacencyEntry[]>

export function buildAdjacency(edges: AppEdge[]): AdjacencyMap {
  const map: AdjacencyMap = {}
  for (const edge of edges) {
    if (!map[edge.source]) map[edge.source] = []
    map[edge.source].push({
      targetId: edge.target,
      sourceHandle: edge.sourceHandle ?? '',
      targetHandle: edge.targetHandle ?? '',
    })
  }
  return map
}

export function findNodeById(nodes: AppNode[], id: string): AppNode | undefined {
  return nodes.find((n) => n.id === id)
}

export function traverseExecFlow(rootId: string, nodes: AppNode[], adjacency: AdjacencyMap): AppNode[] {
  const visited = new Set<string>()
  const ordered: AppNode[] = []
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    const node = findNodeById(nodes, current)
    if (node) ordered.push(node)
    const nexts = adjacency[current] ?? []
    for (const edge of nexts) {
      queue.push(edge.targetId)
    }
  }
  return ordered
}

export function getDownstreamNodes(nodeId: string, handleId: string, nodes: AppNode[], edges: AppEdge[], adjacency: AdjacencyMap): AppNode[] {
  const targetEdges = edges.filter((e) => e.source === nodeId && e.sourceHandle === handleId)
  const result: AppNode[] = []
  for (const edge of targetEdges) {
    result.push(...traverseExecFlow(edge.target, nodes, adjacency))
  }
  return result
}
