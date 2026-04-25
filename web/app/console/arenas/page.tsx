'use client'

import { useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type NodeTypes,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// ── Arena list data ────────────────────────────────────────────
interface Arena {
  id: string; name: string; model: string; gym: string; judge: string
  status: string; reward: number; loss: number; uptime: string
}

const arenas: Arena[] = [
  { id: 'ARN-001', name: 'CodeGen-7B-RL',    model: 'Llama-3-7B',   gym: 'PythonCoding-v3', judge: 'GPT-4o',    status: 'running', reward: 94.2, loss: 0.043, uptime: '14h 23m' },
  { id: 'ARN-002', name: 'RoboSim-Physics',   model: 'Gemma-2B',     gym: 'PhysicsSim-v1',   judge: 'Claude-3.5', status: 'paused',  reward: 73.1, loss: 0.118, uptime: '3h 07m' },
  { id: 'ARN-004', name: 'TradingBot-Sigma',  model: 'Mistral-8x7B', gym: 'MarketSim-v2',    judge: 'Llama-70B', status: 'running', reward: 87.6, loss: 0.067, uptime: '8h 51m' },
  { id: 'ARN-007', name: 'PythonTutor-v2',    model: 'Phi-3-mini',   gym: 'CodingGym-v2',    judge: 'GPT-4o',    status: 'running', reward: 68.9, loss: 0.091, uptime: '2h 14m' },
  { id: 'ARN-011', name: 'MathReasoner',       model: 'Qwen-1.5B',   gym: 'MathEnv-v1',      judge: 'Claude-3.5', status: 'running', reward: 61.2, loss: 0.142, uptime: '1h 33m' },
]

// ── Orchestrator node types ────────────────────────────────────
type ONodeType = 'baseModel' | 'gym' | 'database' | 'server' | 'compute' | 'deploy'

interface ONodeData extends Record<string, unknown> {
  label: string
  sub?: string
  nodeType: ONodeType
}

const nodeColors: Record<ONodeType, string> = {
  baseModel: '#7c3aed',
  gym:       '#22c55e',
  database:  '#3b82f6',
  server:    '#f59e0b',
  compute:   '#f43f5e',
  deploy:    '#a855f7',
}

const nodeIcons: Record<ONodeType, string> = {
  baseModel: '🤖',
  gym:       '🏟️',
  database:  '🗄️',
  server:    '🌐',
  compute:   '⚡',
  deploy:    '🚀',
}

function OrchestratorNode({ data }: { data: ONodeData }) {
  const color = nodeColors[data.nodeType]
  return (
    <div className="relative rounded-xl border overflow-hidden min-w-36"
      style={{ backgroundColor: '#0e1018', borderColor: color + '60', boxShadow: `0 0 12px ${color}22` }}>
      <Handle type="target" position={Position.Left} style={{ background: color, border: 'none', width: 8, height: 8 }} />
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ backgroundColor: color + '22', borderBottom: `1px solid ${color}40` }}>
        <span className="text-sm">{nodeIcons[data.nodeType]}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{data.nodeType}</span>
      </div>
      <div className="px-3 py-2">
        <div className="text-[12px] font-semibold text-white">{data.label}</div>
        {data.sub && <div className="text-[10px] text-gray-500 mt-0.5">{data.sub}</div>}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: color, border: 'none', width: 8, height: 8 }} />
    </div>
  )
}

const orchestratorNodeTypes: NodeTypes = { orchestrator: OrchestratorNode }

const paletteItems: { type: ONodeType; label: string; desc: string }[] = [
  { type: 'baseModel', label: 'Base Model',   desc: 'Foundation LLM to fine-tune' },
  { type: 'gym',       label: 'Gym',          desc: 'Training environment' },
  { type: 'database',  label: 'Database',     desc: 'External context DB' },
  { type: 'server',    label: 'Server',       desc: 'API / tool server' },
  { type: 'compute',   label: 'Compute Spec', desc: 'GPU allocation spec' },
  { type: 'deploy',    label: 'Deploy',       desc: 'Push to 0G swarm' },
]

const initialNodes: Node[] = [
  { id: 'bm1',  type: 'orchestrator', position: { x: 80,  y: 120 }, data: { label: 'Llama-3-7B',    sub: '7B params · fp16', nodeType: 'baseModel' } },
  { id: 'gy1',  type: 'orchestrator', position: { x: 340, y: 60  }, data: { label: 'PythonCoding',  sub: 'v3.1 · Open',      nodeType: 'gym' } },
  { id: 'gy2',  type: 'orchestrator', position: { x: 340, y: 180 }, data: { label: 'MathEnv',       sub: 'v1.0 · Open',      nodeType: 'gym' } },
  { id: 'sv1',  type: 'orchestrator', position: { x: 340, y: 300 }, data: { label: 'GitHub API',    sub: 'REST · OAuth',      nodeType: 'server' } },
  { id: 'cp1',  type: 'orchestrator', position: { x: 600, y: 120 }, data: { label: '4x A100 80G',   sub: '320 GB VRAM',       nodeType: 'compute' } },
  { id: 'dp1',  type: 'orchestrator', position: { x: 840, y: 120 }, data: { label: 'Deploy to Swarm', sub: '0G Network',      nodeType: 'deploy' } },
]
const initialEdges = [
  { id: 'e1', source: 'bm1', target: 'gy1', animated: true, style: { stroke: '#7c3aed' } },
  { id: 'e2', source: 'bm1', target: 'gy2', animated: true, style: { stroke: '#7c3aed' } },
  { id: 'e3', source: 'bm1', target: 'sv1', animated: true, style: { stroke: '#7c3aed' } },
  { id: 'e4', source: 'gy1', target: 'cp1', animated: true, style: { stroke: '#22c55e' } },
  { id: 'e5', source: 'gy2', target: 'cp1', animated: true, style: { stroke: '#22c55e' } },
  { id: 'e6', source: 'cp1', target: 'dp1', animated: true, style: { stroke: '#f43f5e' } },
]

// ── Main page ──────────────────────────────────────────────────
export default function ArenasPage() {
  const [view, setView] = useState<'list' | 'orchestrator'>('list')
  const [selected, setSelected] = useState(arenas[0])

  return view === 'list'
    ? <ArenaList arenas={arenas} selected={selected} setSelected={setSelected} onNew={() => setView('orchestrator')} />
    : <Orchestrator onBack={() => setView('list')} />
}

// ── Arena list view ────────────────────────────────────────────
function ArenaList({ arenas, selected, setSelected, onNew }: {
  arenas: Arena[]
  selected: Arena
  setSelected: (a: Arena) => void
  onNew: () => void
}) {
  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h1 className="text-base font-semibold text-white">Arenas</h1>
            <p className="text-[11px] text-muted">Active reinforcement learning sessions</p>
          </div>
          <button
            onClick={onNew}
            className="flex items-center gap-1.5 bg-purple hover:bg-purple/80 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <span className="text-base leading-none">+</span> New Arena
          </button>
        </div>

        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-border">
          {['All', 'Running', 'Paused'].map((f, i) => (
            <button key={f} className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${i === 0 ? 'bg-border text-white' : 'bg-surface-2 text-muted hover:text-white'}`}>{f}</button>
          ))}
          <div className="flex-1" />
          <span className="text-[11px] text-muted">{arenas.filter(a => a.status === 'running').length} running · {arenas.filter(a => a.status === 'paused').length} paused</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-space border-b border-border">
              <tr>
                {['Arena','Model','Gym','Reward','Loss','Uptime'].map((h, i) => (
                  <th key={h} className={`text-[10px] text-muted font-medium px-4 py-2.5 uppercase tracking-wider ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {arenas.map(a => (
                <tr key={a.id} onClick={() => setSelected(a)}
                  className={`border-b border-border cursor-pointer transition-colors ${selected.id === a.id ? 'bg-purple/10 border-l-2 border-l-purple' : 'hover:bg-surface-2'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.status === 'running' ? 'bg-green animate-pulse' : 'bg-amber'}`} />
                      <div>
                        <div className="text-[13px] font-medium text-white">{a.name}</div>
                        <div className="text-[10px] font-mono text-muted">{a.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-gray-400">{a.model}</td>
                  <td className="px-4 py-3 text-[12px] text-gray-400">{a.gym}</td>
                  <td className="px-4 py-3 text-right text-[12px] font-mono text-white">{a.reward}</td>
                  <td className="px-4 py-3 text-right text-[12px] font-mono text-muted">{a.loss.toFixed(3)}</td>
                  <td className="px-4 py-3 text-right text-[11px] text-muted">{a.uptime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live metrics panel */}
      <div className="w-64 border-l border-border bg-surface shrink-0 flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <div className="text-sm font-semibold text-white">{selected.name}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-1.5 h-1.5 rounded-full ${selected.status === 'running' ? 'bg-green animate-pulse' : 'bg-amber'}`} />
            <span className="text-[11px] text-muted capitalize">{selected.status} · {selected.uptime}</span>
          </div>
        </div>
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Reward" value={selected.reward.toFixed(1)} color="text-green" />
            <Metric label="Loss"   value={selected.loss.toFixed(3)}   color="text-amber" />
          </div>
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Reward Curve</div>
            <MiniChart color="#22c55e" />
          </div>
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Loss Curve</div>
            <MiniChart color="#f59e0b" descending />
          </div>
          <div className="space-y-1.5">
            {[['Judge', selected.judge], ['Gym', selected.gym], ['LR', '3e-5'], ['KL', '0.02']].map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11px]">
                <span className="text-muted">{k}</span><span className="text-white">{v}</span>
              </div>
            ))}
          </div>
          <button className="w-full text-[12px] py-1.5 rounded-lg bg-purple hover:bg-purple/80 text-white font-medium transition-colors">
            Deploy to Swarm
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Orchestrator canvas ────────────────────────────────────────
function Orchestrator({ onBack }: { onBack: () => void }) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [deploying, setDeploying] = useState(false)
  const [deployed, setDeployed] = useState(false)

  const onConnect = useCallback((c: Connection) =>
    setEdges(es => addEdge({ ...c, animated: true, style: { stroke: '#7c3aed' } }, es)), [setEdges])

  function onDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }

  function deploy() {
    setDeploying(true)
    setTimeout(() => { setDeploying(false); setDeployed(true) }, 2500)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-surface shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-muted hover:text-white transition-colors">
          ← Arenas
        </button>
        <div className="w-px h-4 bg-border" />
        <span className="text-sm font-semibold text-white">Arena Orchestrator</span>
        <span className="text-[11px] text-muted">Wire components to define your training run</span>
        <div className="flex-1" />
        <button
          onClick={deploy}
          disabled={deploying || deployed}
          className={`text-[12px] font-medium px-4 py-1.5 rounded-lg transition-all ${
            deployed ? 'bg-green/20 border border-green/40 text-green' :
            deploying ? 'bg-purple/40 text-purple-300 cursor-wait' :
            'bg-purple hover:bg-purple/80 text-white'}`}
        >
          {deployed ? '✓ Deployed to 0G Swarm' : deploying ? '⚙ Deploying…' : '🚀 Deploy Arena'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left palette */}
        <div className="w-48 border-r border-border bg-surface flex flex-col shrink-0">
          <div className="px-3 py-2.5 border-b border-border">
            <span className="text-[10px] text-muted uppercase tracking-wider">Components</span>
          </div>
          <div className="p-2 space-y-1.5 overflow-y-auto">
            {paletteItems.map(item => (
              <div
                key={item.type}
                draggable
                onDragStart={e => e.dataTransfer.setData('nodeType', item.type)}
                className="flex items-start gap-2 p-2.5 rounded-lg border border-border bg-surface-2 hover:border-gray-600 cursor-grab active:cursor-grabbing transition-colors"
              >
                <span className="text-base leading-none mt-0.5">{nodeIcons[item.type]}</span>
                <div>
                  <div className="text-[11px] font-medium text-white">{item.label}</div>
                  <div className="text-[10px] text-muted leading-tight">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1" onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={orchestratorNodeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            style={{ background: '#08090e' }}
            defaultEdgeOptions={{ animated: true, style: { stroke: '#1e2030', strokeWidth: 2 } }}
          >
            <Background color="#1e2030" gap={24} size={1} />
            <Controls style={{ background: '#0e1018', border: '1px solid #1e2030', borderRadius: 8 }} />
            <MiniMap
              style={{ background: '#0e1018', border: '1px solid #1e2030' }}
              nodeColor={n => nodeColors[(n.data as ONodeData).nodeType] + '88'}
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-2.5">
      <div className="text-[10px] text-muted">{label}</div>
      <div className={`text-base font-mono font-bold ${color}`}>{value}</div>
    </div>
  )
}

function MiniChart({ color, descending = false }: { color: string; descending?: boolean }) {
  const raw = [30, 38, 45, 42, 55, 60, 58, 70, 68, 80, 76, 88, 85, 92, 90, 96]
  const data = descending ? raw.map(v => 100 - v * 0.6) : raw
  const max = Math.max(...data)
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - (v / max) * 100}`).join(' ')
  return (
    <svg viewBox="0 0 100 60" className="w-full h-10" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={`0,100 ${pts} 100,100`} fill={color} opacity="0.08" />
    </svg>
  )
}
