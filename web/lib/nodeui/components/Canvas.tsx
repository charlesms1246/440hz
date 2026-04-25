import { useCallback, useEffect, useMemo, useRef, type DragEvent } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  useReactFlow,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from '@xyflow/react'
import { useGraphStore } from '@nodeui/store/graphStore'
import { REACT_FLOW_NODE_TYPES, NODE_REGISTRY } from '@nodeui/nodes/registry'
import { NodeType } from '@nodeui/types/nodes'

export function Canvas() {
  const {
    nodes, edges, graphVersion,
    onNodesChange, onEdgesChange, onConnect,
    addNode, setSelectedNode,
  } = useGraphStore()

  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, fitView } = useReactFlow()

  const nodeTypes = useMemo(() => REACT_FLOW_NODE_TYPES, [])

  useEffect(() => {
    if (graphVersion === 0) return
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
  }, [graphVersion, fitView])

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const nodeType = e.dataTransfer.getData('nodeType') as NodeType
    if (!nodeType || !Object.values(NodeType).includes(nodeType)) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode(nodeType, position)
  }, [screenToFlowPosition, addNode])

  return (
    <div ref={reactFlowWrapper} style={{ flex: 1, height: '100%', background: '#0d0d1a' }}>
      <ReactFlow
        nodes={nodes as Parameters<typeof ReactFlow>[0]['nodes']}
        edges={edges}
        onNodesChange={onNodesChange as OnNodesChange}
        onEdgesChange={onEdgesChange as OnEdgesChange}
        onConnect={onConnect as OnConnect}
        onNodeClick={(_, node) => setSelectedNode(node.id)}
        onPaneClick={() => setSelectedNode(null)}
        nodeTypes={nodeTypes}
        onDragOver={onDragOver}
        onDrop={onDrop}
        snapToGrid
        snapGrid={[16, 16]}
        fitView
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#4a4a6a', strokeWidth: 2 },
        }}
        connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '5 5' }}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#0d0d1a' }}
      >
        <Background
          color="#1e1e3a"
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
        />
        <MiniMap
          style={{ background: '#111122', border: '1px solid #1e1e3a' }}
          nodeColor={(n) => NODE_REGISTRY[n.type as NodeType]?.accentHex ?? '#8888aa'}
          maskColor="rgba(0,0,0,0.5)"
        />
        <Controls
          style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  )
}
