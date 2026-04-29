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
import { useThemeStore } from '@/lib/themeStore'

export function Canvas() {
  const {
    nodes, edges, graphVersion,
    onNodesChange, onEdgesChange, onConnect,
    addNode, setSelectedNode,
  } = useGraphStore()

  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, fitView } = useReactFlow()
  const theme = useThemeStore(s => s.theme)
  const isDark = theme === 'dark'

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
    <div ref={reactFlowWrapper} style={{ flex: 1, height: '100%', background: 'var(--nodeui-canvas)' }}>
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
          style: { stroke: 'var(--nodeui-dim)', strokeWidth: 2 },
        }}
        connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '5 5' }}
        proOptions={{ hideAttribution: true }}
        colorMode={isDark ? 'dark' : 'light'}
        style={{ background: 'var(--nodeui-canvas)' }}
      >
        <Background
          color={isDark ? '#1e1e3a' : '#c8c8e0'}
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
        />
        <MiniMap
          style={{ background: 'var(--nodeui-surface)', border: '1px solid var(--nodeui-border-subtle)' }}
          nodeColor={(n) => NODE_REGISTRY[n.type as NodeType]?.accentHex ?? 'var(--nodeui-muted)'}
          maskColor={isDark ? 'rgba(0,0,0,0.5)' : 'rgba(200,200,220,0.4)'}
        />
        <Controls
          style={{ background: 'var(--nodeui-node)', border: '1px solid var(--nodeui-border-strong)', borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  )
}
