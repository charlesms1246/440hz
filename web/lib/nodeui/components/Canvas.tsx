import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
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
import { notify } from '@/lib/notificationStore'

interface CanvasProps {
  fullscreenTarget?: React.RefObject<HTMLElement | null>
}

export function Canvas({ fullscreenTarget }: CanvasProps = {}) {
  const {
    nodes, edges, graphVersion,
    onNodesChange, onEdgesChange, onConnect,
    addNode, setSelectedNode, clearCanvas,
  } = useGraphStore()

  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, fitView } = useReactFlow()
  const theme = useThemeStore(s => s.theme)
  const isDark = theme === 'dark'
  const [isFullscreen, setIsFullscreen] = useState(false)

  const nodeTypes = useMemo(() => REACT_FLOW_NODE_TYPES, [])

  useEffect(() => {
    if (graphVersion === 0) return
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
  }, [graphVersion, fitView])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = fullscreenTarget?.current ?? reactFlowWrapper.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [fullscreenTarget])

  const handleClearCanvas = useCallback(() => {
    if (nodes.length === 0) return
    clearCanvas()
    notify('info', 'Canvas cleared', `Removed ${nodes.length} node${nodes.length !== 1 ? 's' : ''}`)
  }, [nodes.length, clearCanvas])

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
    <div
      ref={reactFlowWrapper}
      style={{
        flex: 1, height: '100%',
        background: 'var(--nodeui-canvas)',
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
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

      {/* Canvas overlay toolbar — top right */}
      <div style={{
        position: 'absolute', top: 10, right: 10, zIndex: 5,
        display: 'flex', gap: 4,
      }}>
        {/* Clear canvas */}
        <button
          onClick={handleClearCanvas}
          title="Clear all nodes"
          disabled={nodes.length === 0}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6,
            background: 'var(--nodeui-node)', border: '1px solid var(--nodeui-border-strong)',
            color: 'var(--nodeui-dim)', cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
            opacity: nodes.length === 0 ? 0.4 : 1, fontSize: 13,
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => { if (nodes.length > 0) { (e.currentTarget as HTMLButtonElement).style.color = '#f43f5e'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#f43f5e44' } }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nodeui-border-strong)' }}
        >
          ⌫
        </button>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6,
            background: 'var(--nodeui-node)', border: '1px solid var(--nodeui-border-strong)',
            color: 'var(--nodeui-dim)', cursor: 'pointer', fontSize: 13,
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-text)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nodeui-dim)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--nodeui-dim)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nodeui-border-strong)' }}
        >
          {isFullscreen ? '⛶' : '⛶'}
        </button>
      </div>
    </div>
  )
}
