import { create } from 'zustand'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react'
import type { AppNode, AppEdge } from '@nodeui/types/graph'
import type { AnyNodeData, RouterSwitchData } from '@nodeui/types/nodes'
import { NodeType } from '@nodeui/types/nodes'
import { getNodeDefaults } from '@nodeui/utils/nodeHelpers'

interface GraphStore {
  nodes: AppNode[]
  edges: AppEdge[]
  selectedNodeId: string | null
  projectName: string
  graphVersion: number

  onNodesChange: (changes: NodeChange<AppNode>[]) => void
  onEdgesChange: (changes: EdgeChange<AppEdge>[]) => void
  onConnect: (connection: Connection) => void

  addNode: (nodeType: NodeType, position: { x: number; y: number }) => void
  updateNodeData: (nodeId: string, data: Partial<AnyNodeData>) => void
  removeNode: (nodeId: string) => void
  setSelectedNode: (nodeId: string | null) => void

  addRouterCondition: (nodeId: string) => void
  removeRouterCondition: (nodeId: string, conditionId: string) => void

  setProjectName: (name: string) => void
  clearCanvas: () => void
  loadGraph: (nodes: AppNode[], edges: AppEdge[]) => void
}

export const useGraphStore = create<GraphStore>()((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  projectName: 'My Gym Environment',
  graphVersion: 0,

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) as AppNode[] })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) as AppEdge[] })),

  onConnect: (connection) =>
    set((s) => ({
      edges: addEdge({ ...connection, animated: true }, s.edges) as AppEdge[],
    })),

  addNode: (nodeType, position) => {
    const defaults = getNodeDefaults(nodeType)
    const node: AppNode = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType,
      position,
      data: defaults,
    }
    set((s) => ({ nodes: [...s.nodes, node] }))
  },

  updateNodeData: (nodeId, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } as AnyNodeData } : n
      ),
    })),

  removeNode: (nodeId) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId,
    })),

  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),

  addRouterCondition: (nodeId) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.nodeType !== NodeType.RouterSwitch) return n
        const data = n.data as RouterSwitchData
        const idx = data.conditions.length
        return {
          ...n,
          data: {
            ...data,
            conditions: [
              ...data.conditions,
              { id: `cond-${Date.now()}`, label: `Path ${String.fromCharCode(65 + idx)}`, condition: '' },
            ],
          },
        }
      }),
    })),

  removeRouterCondition: (nodeId, conditionId) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId || n.data.nodeType !== NodeType.RouterSwitch) return n
        const data = n.data as RouterSwitchData
        return {
          ...n,
          data: {
            ...data,
            conditions: data.conditions.filter((c) => c.id !== conditionId),
          },
        }
      }),
    })),

  setProjectName: (name) => set({ projectName: name }),
  clearCanvas: () => set({ nodes: [], edges: [], selectedNodeId: null }),
  loadGraph: (nodes, edges) => set((s) => ({ nodes, edges, selectedNodeId: null, graphVersion: s.graphVersion + 1 })),
}))
