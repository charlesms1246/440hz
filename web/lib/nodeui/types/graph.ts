import type { Node, Edge } from '@xyflow/react'
import type { AnyNodeData } from './nodes'

export type AppNode = Node<AnyNodeData>
export type AppEdge = Edge<{ label?: string }>

export interface GraphState {
  nodes: AppNode[]
  edges: AppEdge[]
  selectedNodeId: string | null
  projectName: string
}
