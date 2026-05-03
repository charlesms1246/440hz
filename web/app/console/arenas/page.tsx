'use client'

import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { formatEther } from 'ethers'
import { useAccount } from 'wagmi'
import {
  contractEstimateCost,
  contractDepositJob,
  DEFAULT_COMPUTE_PROVIDER,
} from '@/lib/contracts'

import { PROVIDER_API, providerFetch } from '@/lib/utils/providerApi'
import { keccak256, toUtf8Bytes } from 'ethers'

const ZK_SERVER_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ZK_SERVER_URL) ||
  'http://localhost:3050'
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, type Connection, type Node, type NodeTypes,
  Handle, Position,
} from '@xyflow/react'
import { useGymStore } from '@/lib/gymStore'

// ── Types ──────────────────────────────────────────────────────

type ArenaStatus = 'running' | 'paused' | 'pending' | 'failed'

interface Arena {
  id: string
  name: string
  model: string
  gym: string
  gymHash?: string
  judge: string
  status: ArenaStatus
  reward: number
  loss: number
  uptime: string
  taskJson?: TaskConfig
}

interface TaskConfig {
  task_id: string
  base_model: { source: 'hf'; ref: string; quantization: string; dtype: string }
  gym: { image_ref: string; port: number; cpu_limit: number; memory_limit: string; env: Record<string, string> }
  supervisor: { type: 'openai_compatible'; base_url: string; model: string; api_key: null; rubric: string; scoring_mode: 'per_step' }
  algorithm: { name: 'grpo' | 'ppo' | 'dpo'; num_episodes: number; learning_rate: number; lora_rank: number; lora_alpha: number; lora_dropout: number; target_modules: string[]; max_new_tokens: number; temperature: number; top_p: number; kl_coef: number; batch_size: number; grad_accum_steps: number; group_size: number; save_every: number }
  output: { destination: '0g'; encryption_pubkey: null; local_path: string }
  metadata: { submitted_by: string; notes: string }
}

interface DataConnector {
  label: string
  uri: string
  mountEnv: string
}

interface WizardDraft {
  arenaName: string
  modelRef: string
  quantization: 'none' | 'nf4' | 'int8'
  dtype: 'bfloat16' | 'float16' | 'float32'
  gymHash: string
  gymName: string
  judgeBaseUrl: string
  judgeModel: string
  rubric: string
  algorithm: 'grpo' | 'ppo' | 'dpo'
  numEpisodes: number
  learningRate: string
  loraRank: number
  batchSize: number
  maxNewTokens: number
  klCoef: string
  connectors: DataConnector[]
}

// ── Constants ──────────────────────────────────────────────────

const SEED_ARENAS: Arena[] = [
  { id: 'ARN-001', name: 'CodeGen-7B-RL',    model: 'Llama-3-7B',   gym: 'PythonCoding-v3', judge: 'GPT-4o',       status: 'running', reward: 94.2, loss: 0.043, uptime: '14h 23m' },
  { id: 'ARN-002', name: 'RoboSim-Physics',  model: 'Gemma-2B',     gym: 'PhysicsSim-v1',  judge: 'Claude-3.5',   status: 'paused',  reward: 73.1, loss: 0.118, uptime: '3h 07m'  },
  { id: 'ARN-004', name: 'TradingBot-Sigma', model: 'Mistral-8x7B', gym: 'MarketSim-v2',   judge: 'Llama-70B',    status: 'running', reward: 87.6, loss: 0.067, uptime: '8h 51m'  },
  { id: 'ARN-007', name: 'PythonTutor-v2',   model: 'Phi-3-mini',   gym: 'CodingGym-v2',   judge: 'GPT-4o',       status: 'running', reward: 68.9, loss: 0.091, uptime: '2h 14m'  },
  { id: 'ARN-011', name: 'MathReasoner',     model: 'Qwen-1.5B',    gym: 'MathEnv-v1',     judge: 'Claude-3.5',   status: 'running', reward: 61.2, loss: 0.142, uptime: '1h 33m'  },
]

const DRAFT_DEFAULTS: WizardDraft = {
  arenaName: '',
  modelRef: 'Qwen/Qwen2.5-0.5B-Instruct',
  quantization: 'nf4',
  dtype: 'bfloat16',
  gymHash: '',
  gymName: '',
  judgeBaseUrl: 'https://router-api.0g.ai/v1',
  judgeModel: 'zai-org/GLM-5-FP8',
  rubric: 'You are evaluating an AI agent\'s response. Score from 0.0 to 1.0 based on quality, relevance, and correctness. Respond with ONLY a JSON object: {"score": <float 0..1>, "reason": "<one short sentence>"}.',
  algorithm: 'grpo',
  numEpisodes: 50,
  learningRate: '2e-5',
  loraRank: 16,
  batchSize: 1,
  maxNewTokens: 128,
  klCoef: '0.04',
  connectors: [],
}

const POPULAR_MODELS = [
  'Qwen/Qwen2.5-0.5B-Instruct',
  'Qwen/Qwen2.5-7B-Instruct',
  'Qwen/Qwen2.5-14B-Instruct',
  'meta-llama/Llama-3.2-1B-Instruct',
  'meta-llama/Llama-3.2-3B-Instruct',
  'microsoft/Phi-3-mini-4k-instruct',
  'google/gemma-2-2b-it',
  'mistralai/Mistral-7B-Instruct-v0.3',
]

// ── Main page ──────────────────────────────────────────────────

export default function ArenasPage() {
  const [view, setView] = useState<'list' | 'orchestrator'>('list')
  const [arenas, setArenas] = useState<Arena[]>(SEED_ARENAS)
  const [selected, setSelected] = useState<Arena>(SEED_ARENAS[0])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [filter, setFilter] = useState<'All' | 'Running' | 'Paused' | 'Pending'>('All')

  function addArena(arena: Arena) {
    setArenas(prev => [arena, ...prev])
    setSelected(arena)
    setWizardOpen(false)
  }

  return (
    <>
      {wizardOpen && (
        <NewArenaWizard
          onClose={() => setWizardOpen(false)}
          onSubmit={addArena}
        />
      )}

      {view === 'list' ? (
        <ArenaList
          arenas={arenas}
          selected={selected}
          setSelected={setSelected}
          filter={filter}
          setFilter={setFilter}
          onNew={() => setWizardOpen(true)}
          onViewCanvas={() => setView('orchestrator')}
        />
      ) : (
        <Orchestrator arena={selected} onBack={() => setView('list')} />
      )}
    </>
  )
}

// ── Arena list ─────────────────────────────────────────────────

function ArenaList({
  arenas,
  selected,
  setSelected,
  filter,
  setFilter,
  onNew,
  onViewCanvas,
}: {
  arenas: Arena[]
  selected: Arena
  setSelected: (a: Arena) => void
  filter: 'All' | 'Running' | 'Paused' | 'Pending'
  setFilter: (f: 'All' | 'Running' | 'Paused' | 'Pending') => void
  onNew: () => void
  onViewCanvas: () => void
}) {
  const filtered = arenas.filter(a => {
    if (filter === 'All')     return true
    if (filter === 'Running') return a.status === 'running'
    if (filter === 'Paused')  return a.status === 'paused'
    if (filter === 'Pending') return a.status === 'pending' || a.status === 'failed'
    return true
  })

  const counts = {
    running: arenas.filter(a => a.status === 'running').length,
    paused:  arenas.filter(a => a.status === 'paused').length,
    pending: arenas.filter(a => a.status === 'pending' || a.status === 'failed').length,
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: table */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h1 className="text-base font-semibold text-white">Arenas</h1>
            <p className="text-[11px] text-muted">Active reinforcement learning sessions</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onViewCanvas}
              className="text-[12px] px-3 py-1.5 border border-border text-muted hover:text-white transition-colors"
            >
              Canvas
            </button>
            <button
              onClick={onNew}
              className="flex items-center gap-1.5 bg-purple hover:bg-purple/80 text-white text-xs font-medium px-3 py-1.5 transition-colors"
            >
              <span className="text-base leading-none">+</span> New Arena
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-border">
          {(['All', 'Running', 'Paused', 'Pending'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[11px] px-2.5 py-1 transition-colors ${filter === f ? 'bg-border text-white' : 'bg-surface-2 text-muted hover:text-white'}`}
            >
              {f}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-[11px] text-muted">
            {counts.running} running · {counts.paused} paused
            {counts.pending > 0 && ` · ${counts.pending} pending`}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-[12px] text-muted">
              No arenas match this filter
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-space border-b border-border">
                <tr>
                  {['Arena', 'Model', 'Gym', 'Reward', 'Loss', 'Uptime'].map((h, i) => (
                    <th
                      key={h}
                      className={`text-[10px] text-muted font-medium px-4 py-2.5 uppercase tracking-wider ${i >= 3 ? 'text-right' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr
                    key={a.id}
                    onClick={() => setSelected(a)}
                    className={`border-b border-border cursor-pointer transition-colors ${selected.id === a.id ? 'bg-purple/10 border-l-2 border-l-purple' : 'hover:bg-surface-2'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <StatusDot status={a.status} />
                        <div>
                          <div className="text-[13px] font-medium text-white">{a.name}</div>
                          <div className="text-[10px] font-mono text-muted">{a.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-gray-400">{a.model}</td>
                    <td className="px-4 py-3 text-[12px] text-gray-400">{a.gym}</td>
                    <td className="px-4 py-3 text-right text-[12px] font-mono text-white">
                      {a.status === 'pending' ? '—' : a.reward.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right text-[12px] font-mono text-muted">
                      {a.status === 'pending' ? '—' : a.loss.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right text-[11px] text-muted">{a.uptime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      <ArenaDetailPanel arena={selected} />
    </div>
  )
}

function StatusDot({ status }: { status: ArenaStatus }) {
  const cls = {
    running: 'bg-green animate-pulse',
    paused:  'bg-amber',
    pending: 'bg-blue-400 animate-pulse',
    failed:  'bg-red-500',
  }[status]
  return <span className={`w-1.5 h-1.5 shrink-0 ${cls}`} />
}

// ── Arena detail panel ─────────────────────────────────────────

function ArenaDetailPanel({ arena }: { arena: Arena }) {
  const [taskOpen, setTaskOpen] = useState(false)

  return (
    <div className="w-64 border-l border-border bg-surface shrink-0 flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-sm font-semibold text-white">{arena.name}</div>
        <div className="flex items-center gap-1.5 mt-1">
          <StatusDot status={arena.status} />
          <span className="text-[11px] text-muted capitalize">
            {arena.status} · {arena.uptime}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {arena.status === 'pending' ? (
          <div className="p-3 border border-blue-400/20 bg-blue-400/5">
            <p className="text-[11px] text-blue-400/80">
              Arena queued. Awaiting 0G Compute executor deployment.
            </p>
            {arena.taskJson && (
              <button
                onClick={() => setTaskOpen(t => !t)}
                className="mt-2 text-[10px] text-muted hover:text-white transition-colors"
              >
                {taskOpen ? '▲ Hide' : '▼ View'} task.json
              </button>
            )}
            {taskOpen && arena.taskJson && (
              <pre className="mt-2 text-[9px] font-mono text-green/70 overflow-x-auto max-h-48 overflow-y-auto leading-relaxed">
                {JSON.stringify(arena.taskJson, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Reward" value={arena.reward.toFixed(1)} color="text-green" />
              <Metric label="Loss"   value={arena.loss.toFixed(3)}   color="text-amber"  />
            </div>
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Reward Curve</div>
              <MiniChart color="#22c55e" />
            </div>
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Loss Curve</div>
              <MiniChart color="#f59e0b" descending />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          {[
            ['Judge', arena.judge],
            ['Gym',   arena.gym],
            ...(arena.status !== 'pending' ? [['LR', '3e-5'], ['KL', '0.02']] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-[11px]">
              <span className="text-muted">{k}</span>
              <span className="text-white truncate ml-2 max-w-[100px] text-right">{v}</span>
            </div>
          ))}
        </div>

        {arena.status !== 'pending' && (
          <button className="w-full text-[12px] py-1.5 bg-purple hover:bg-purple/80 text-white font-medium transition-colors">
            Deploy to Swarm
          </button>
        )}
      </div>
    </div>
  )
}

// ── Orchestrator canvas (job status view) ─────────────────────

type ONodeType = 'baseModel' | 'gym' | 'database' | 'server' | 'compute' | 'deploy'
interface ONodeData extends Record<string, unknown> { label: string; sub?: string; nodeType: ONodeType }

const nodeColors: Record<ONodeType, string> = {
  baseModel: '#7c3aed', gym: '#22c55e', database: '#3b82f6',
  server: '#f59e0b',    compute: '#f43f5e', deploy: '#a855f7',
}
const nodeIcons: Record<ONodeType, string> = {
  baseModel: '🤖', gym: '🏟️', database: '🗄️',
  server: '🌐',    compute: '⚡', deploy: '🚀',
}

function OrchestratorNode({ data }: { data: ONodeData }) {
  const color = nodeColors[data.nodeType]
  return (
    <div className="relative border overflow-hidden min-w-36"
      style={{ backgroundColor: '#0e1018', borderColor: color + '60', boxShadow: `0 0 12px ${color}22` }}
    >
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
  { type: 'baseModel', label: 'Base Model',    desc: 'Foundation LLM to fine-tune' },
  { type: 'gym',       label: 'Gym',           desc: 'Training environment'         },
  { type: 'database',  label: 'Database',      desc: 'External context DB'          },
  { type: 'server',    label: 'Server',        desc: 'API / tool server'            },
  { type: 'compute',   label: 'Compute Spec',  desc: 'GPU allocation spec'          },
  { type: 'deploy',    label: 'Deploy',        desc: 'Push to 0G swarm'            },
]

function buildTopologyNodes(arena: Arena | null): Node[] {
  if (!arena?.taskJson) {
    return [
      { id: 'bm1', type: 'orchestrator', position: { x: 80,  y: 120 }, data: { label: 'Llama-3-7B',       sub: '7B params · fp16',  nodeType: 'baseModel' } },
      { id: 'gy1', type: 'orchestrator', position: { x: 340, y: 60  }, data: { label: 'PythonCoding',      sub: 'v3.1 · Open',       nodeType: 'gym'       } },
      { id: 'gy2', type: 'orchestrator', position: { x: 340, y: 180 }, data: { label: 'MathEnv',           sub: 'v1.0 · Open',       nodeType: 'gym'       } },
      { id: 'sv1', type: 'orchestrator', position: { x: 340, y: 300 }, data: { label: 'GitHub API',        sub: 'REST · OAuth',      nodeType: 'server'    } },
      { id: 'cp1', type: 'orchestrator', position: { x: 600, y: 120 }, data: { label: '4x A100 80G',       sub: '320 GB VRAM',       nodeType: 'compute'   } },
      { id: 'dp1', type: 'orchestrator', position: { x: 840, y: 120 }, data: { label: 'Deploy to Swarm',   sub: '0G Network',        nodeType: 'deploy'    } },
    ]
  }
  const t = arena.taskJson
  const modelLabel = t.base_model.ref.split('/').pop() ?? t.base_model.ref
  const gymLabel   = t.gym.image_ref.length > 12 ? t.gym.image_ref.slice(0, 10) + '…' : t.gym.image_ref
  return [
    { id: 'bm1', type: 'orchestrator', position: { x: 80,  y: 120 }, data: { label: modelLabel, sub: `${t.base_model.quantization} · ${t.base_model.dtype}`, nodeType: 'baseModel' } },
    { id: 'gy1', type: 'orchestrator', position: { x: 340, y: 120 }, data: { label: gymLabel,   sub: 'gym bundle',                                           nodeType: 'gym'       } },
    { id: 'cp1', type: 'orchestrator', position: { x: 580, y: 120 }, data: { label: `${t.algorithm.name.toUpperCase()} · ep${t.algorithm.num_episodes}`, sub: `lr ${t.algorithm.learning_rate}`, nodeType: 'compute' } },
    { id: 'dp1', type: 'orchestrator', position: { x: 820, y: 120 }, data: { label: 'Deploy to 0G',  sub: t.output.destination,                             nodeType: 'deploy'    } },
  ]
}

const topologyEdges = (hasTask: boolean) => hasTask
  ? [
      { id: 'e1', source: 'bm1', target: 'gy1', animated: true, style: { stroke: '#7c3aed' } },
      { id: 'e2', source: 'gy1', target: 'cp1', animated: true, style: { stroke: '#22c55e' } },
      { id: 'e3', source: 'cp1', target: 'dp1', animated: true, style: { stroke: '#f43f5e' } },
    ]
  : [
      { id: 'e1', source: 'bm1', target: 'gy1', animated: true, style: { stroke: '#7c3aed' } },
      { id: 'e2', source: 'bm1', target: 'gy2', animated: true, style: { stroke: '#7c3aed' } },
      { id: 'e3', source: 'bm1', target: 'sv1', animated: true, style: { stroke: '#7c3aed' } },
      { id: 'e4', source: 'gy1', target: 'cp1', animated: true, style: { stroke: '#22c55e' } },
      { id: 'e5', source: 'gy2', target: 'cp1', animated: true, style: { stroke: '#22c55e' } },
      { id: 'e6', source: 'cp1', target: 'dp1', animated: true, style: { stroke: '#f43f5e' } },
    ]

function Orchestrator({ arena, onBack }: { arena: Arena | null; onBack: () => void }) {
  const initNodes = buildTopologyNodes(arena)
  const initEdges = topologyEdges(!!arena?.taskJson)
  const [nodes, , onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)

  const onConnect = useCallback(
    (c: Connection) => setEdges(es => addEdge({ ...c, animated: true, style: { stroke: '#7c3aed' } }, es)),
    [setEdges],
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-surface shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-muted hover:text-white transition-colors">
          ← Arenas
        </button>
        <div className="w-px h-4 bg-border" />
        <span className="text-sm font-semibold text-white">
          {arena?.name ?? 'Arena Topology'}
        </span>
        {arena && (
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <StatusDot status={arena.status} />
            {arena.status}
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
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
                className="flex items-start gap-2 p-2.5 border border-border bg-surface-2 hover:border-gray-600 cursor-grab active:cursor-grabbing transition-colors"
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

        <div className="flex-1">
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            nodeTypes={orchestratorNodeTypes}
            fitView snapToGrid snapGrid={[16, 16]}
            style={{ background: '#08090e' }}
            defaultEdgeOptions={{ animated: true, style: { stroke: '#1e2030', strokeWidth: 2 } }}
          >
            <Background color="#1e2030" gap={24} size={1} />
            <Controls style={{ background: '#0e1018', border: '1px solid #1e2030' }} />
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

// ── New Arena Wizard ───────────────────────────────────────────

function NewArenaWizard({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (arena: Arena) => void
}) {
  const [step, setStep]   = useState(1)
  const [draft, setDraft] = useState<WizardDraft>(DRAFT_DEFAULTS)
  const [errors, setErrors] = useState<Partial<Record<keyof WizardDraft, string>>>({})
  const [customModel, setCustomModel] = useState(false)
  const [estimatedCost, setEstimatedCost] = useState<bigint>(0n)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const { savedGyms } = useGymStore()
  const { address: walletAddress } = useAccount()

  useEffect(() => {
    if (step !== 4) return
    contractEstimateCost(draft.numEpisodes, draft.loraRank)
      .then(setEstimatedCost)
      .catch(() => setEstimatedCost(0n))
  }, [step, draft.numEpisodes, draft.loraRank])

  function set<K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function validateStep(s: number): boolean {
    const errs: typeof errors = {}
    if (s === 1) {
      if (!draft.arenaName.trim()) errs.arenaName = 'Required'
      if (!draft.modelRef.trim())  errs.modelRef  = 'Required'
    }
    if (s === 2 && !draft.gymHash.trim()) errs.gymHash = 'Select or enter a gym root hash'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function next() { if (validateStep(step)) setStep(s => s + 1) }

  function buildTask(): TaskConfig {
    return {
      task_id: `arena-${Date.now()}`,
      base_model: { source: 'hf', ref: draft.modelRef, quantization: draft.quantization, dtype: draft.dtype },
      gym: { image_ref: draft.gymHash, port: 8080, cpu_limit: 2.0, memory_limit: '4g', env: {} },
      supervisor: {
        type: 'openai_compatible',
        base_url: draft.judgeBaseUrl,
        model: draft.judgeModel,
        api_key: null,
        rubric: draft.rubric,
        scoring_mode: 'per_step',
      },
      algorithm: {
        name: draft.algorithm,
        num_episodes: draft.numEpisodes,
        learning_rate: parseFloat(draft.learningRate) || 2e-5,
        lora_rank: draft.loraRank,
        lora_alpha: draft.loraRank * 2,
        lora_dropout: 0.05,
        target_modules: ['q_proj', 'k_proj', 'v_proj', 'o_proj'],
        max_new_tokens: draft.maxNewTokens,
        temperature: 0.9,
        top_p: 0.95,
        kl_coef: parseFloat(draft.klCoef) || 0.04,
        batch_size: draft.batchSize,
        grad_accum_steps: 4,
        group_size: 4,
        save_every: Math.max(10, Math.floor(draft.numEpisodes / 4)),
      },
      output: { destination: '0g', encryption_pubkey: null, local_path: '/var/440hz/output' },
      metadata: { submitted_by: 'wallet', notes: 'Created via 440hz Arena Wizard' },
    }
  }

  async function getOrCreateUserZkKeypair(): Promise<{ pubkey: string[]; privkey: string[] } | null> {
    if (!walletAddress) return null
    const storageKey = `440hz_zk_keypair_${walletAddress}`
    try {
      const cached = localStorage.getItem(storageKey)
      if (cached) return JSON.parse(cached)
      const res = await fetch(`${ZK_SERVER_BASE}/sign-keypair`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) return null
      const kp = await res.json()
      localStorage.setItem(storageKey, JSON.stringify(kp))
      return kp
    } catch {
      return null
    }
  }

  async function buildUserZkSignature(
    taskId: string,
    escrowAmountWei: bigint,
    providerAddress: string,
    keypair: { pubkey: string[]; privkey: string[] },
  ): Promise<{ signature: unknown; pubkey: string[] } | null> {
    try {
      const BN254_FIELD = 2n ** 253n
      const nonce = (BigInt(keccak256(toUtf8Bytes(taskId))) % BN254_FIELD).toString()
      const reqFee = escrowAmountWei.toString()
      const resFee = ((escrowAmountWei * 8n) / 10n).toString()
      const requestHashInput = `${draft.modelRef}:${draft.gymHash}:${draft.algorithm}`
      const requestHash = (BigInt(keccak256(toUtf8Bytes(requestHashInput))) % BN254_FIELD).toString()

      const res = await fetch(`${ZK_SERVER_BASE}/signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          requests: [{
            nonce,
            reqFee,
            userAddress: walletAddress ?? '0x0000000000000000000000000000000000000000',
            providerAddress,
            requestHash,
            resFee,
          }],
          privKey: keypair.privkey,
          signResponse: false,
        }),
      })
      if (!res.ok) return null
      const { signatures } = await res.json()
      return { signature: signatures, pubkey: keypair.pubkey }
    } catch {
      return null
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError('')
    const task = buildTask()

    // 1. Resolve provider address from running daemon (fall back to hardcoded)
    let providerAddress = DEFAULT_COMPUTE_PROVIDER
    try {
      const info = await providerFetch(`/provider/info`).then(r => r.json())
      if (info?.address) providerAddress = info.address
    } catch { /* offline — use default */ }

    // 2. Lock escrow on-chain (non-blocking: training still submitted if tx fails)
    let escrowTxHash = ''
    try {
      escrowTxHash = await contractDepositJob(task.task_id, providerAddress, draft.gymHash, estimatedCost)
    } catch (e) {
      setSubmitError(`Escrow tx failed: ${(e as Error).message}`)
    }

    // 2b. Collect user EdDSA signature for ZK settlement (best-effort, non-blocking)
    let userZkSignature: unknown = null
    let userZkPubkey: string[] | null = null
    const zkKeypair = await getOrCreateUserZkKeypair()
    if (zkKeypair) {
      const zkSig = await buildUserZkSignature(task.task_id, estimatedCost, providerAddress, zkKeypair)
      if (zkSig) {
        userZkSignature = zkSig.signature
        userZkPubkey = zkSig.pubkey
      }
    }

    // 3. POST job to provider API
    try {
      const body = {
        arena_name: draft.arenaName,
        submitter_address: walletAddress ?? '0x0000000000000000000000000000000000000000',
        base_model: {
          source: 'huggingface',
          ref: draft.modelRef,
          quantization: draft.quantization,
          dtype: draft.dtype,
          root_hash: null,
        },
        gym: { root_hash: draft.gymHash, port: 8080, cpu_limit: 2.0, memory_limit: '4g', env: {} },
        overseer: {
          type: 'openai_compatible',
          base_url: draft.judgeBaseUrl,
          model: draft.judgeModel,
          api_key: null,
          rubric: draft.rubric,
          scoring_mode: 'per_step',
        },
        algorithm: {
          name: draft.algorithm,
          num_episodes: draft.numEpisodes,
          learning_rate: parseFloat(draft.learningRate) || 2e-5,
          lora_rank: draft.loraRank,
          lora_alpha: draft.loraRank * 2,
          lora_dropout: 0.05,
          target_modules: ['q_proj', 'k_proj', 'v_proj', 'o_proj'],
          max_new_tokens: draft.maxNewTokens,
          temperature: 0.9,
          top_p: 0.95,
          kl_coef: parseFloat(draft.klCoef) || 0.04,
          batch_size: draft.batchSize,
          grad_accum_steps: 4,
          group_size: 4,
          save_every: Math.max(10, Math.floor(draft.numEpisodes / 4)),
        },
        output: { destination: '0g_storage', encryption_pubkey: null, local_path: null },
        external_connectors: draft.connectors.map(c => ({
          type: 'https',
          label: c.label,
          uri: c.uri,
          mount_env: c.mountEnv || null,
        })),
        runtime: {
          max_runtime_seconds: 7200,
          estimated_cost_og: Number(formatEther(estimatedCost || 0n)),
          escrow_tx_hash: escrowTxHash || '0x0',
          escrow_amount_og: Number(formatEther(estimatedCost || 0n)),
          user_zk_signature: userZkSignature,
          user_zk_pubkey: userZkPubkey,
        },
      }
      const res = await providerFetch(`/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSubmitError(`Provider error: ${err.detail ?? res.status}`)
      }
    } catch (e) {
      if (!submitError) setSubmitError(`Provider unreachable: ${(e as Error).message}`)
    }

    setSubmitting(false)
    onSubmit({
      id: `ARN-${String(Date.now()).slice(-4)}`,
      name: draft.arenaName,
      model: draft.modelRef.split('/').pop() ?? draft.modelRef,
      gym: draft.gymName || draft.gymHash.slice(0, 8) + '…',
      gymHash: draft.gymHash,
      judge: draft.judgeModel.split('/').pop() ?? draft.judgeModel,
      status: 'pending',
      reward: 0,
      loss: 0,
      uptime: '0m',
      taskJson: task,
    })
  }

  const STEPS = ['Base Model', 'Gym & Data', 'Algorithm', 'Review']

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-xl w-[620px] max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">New Arena</h2>
            <p className="text-[11px] text-muted">Configure your RL training run</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-6 py-3 border-b border-border shrink-0 gap-1">
          {STEPS.map((label, i) => {
            const s = i + 1
            const active = s === step
            const done   = s < step
            return (
              <div key={s} className="flex items-center">
                <div className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${done ? 'bg-green text-black' : active ? 'bg-purple text-white' : 'bg-surface-2 text-muted border border-border'}`}>
                    {done ? '✓' : s}
                  </div>
                  <span className={`text-[11px] whitespace-nowrap ${active ? 'text-white' : 'text-muted'}`}>{label}</span>
                </div>
                {i < STEPS.length - 1 && <div className="w-6 h-px bg-border mx-2 shrink-0" />}
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && <Step1Model draft={draft} set={set} errors={errors} customModel={customModel} setCustomModel={setCustomModel} />}
          {step === 2 && <Step2Gym   draft={draft} set={set} errors={errors} savedGyms={savedGyms} />}
          {step === 3 && <Step3Algorithm draft={draft} set={set} />}
          {step === 4 && <Step4Review draft={draft} taskConfig={buildTask()} estimatedCost={estimatedCost} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={() => step === 1 ? onClose() : setStep(s => s - 1)}
            className="text-[12px] px-4 py-1.5 border border-border text-muted hover:text-white transition-colors rounded-lg"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step < 4 ? (
            <button
              onClick={next}
              className="text-[12px] px-4 py-1.5 bg-purple hover:bg-purple/80 text-white rounded-lg font-medium transition-all"
            >
              Next →
            </button>
          ) : (
            <div className="flex flex-col items-end gap-1">
              {submitError && (
                <p className="text-[10px] text-amber max-w-xs text-right truncate" title={submitError}>
                  ⚠ Escrow tx failed — arena added locally: {submitError}
                </p>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="text-[12px] px-5 py-1.5 bg-purple hover:bg-purple/80 disabled:opacity-60 text-white rounded-lg font-medium transition-all"
              >
                {submitting ? '⏳ Depositing…' : 'Submit Arena'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Wizard steps ───────────────────────────────────────────────

function Step1Model({
  draft, set, errors, customModel, setCustomModel,
}: {
  draft: WizardDraft
  set: <K extends keyof WizardDraft>(k: K, v: WizardDraft[K]) => void
  errors: Partial<Record<keyof WizardDraft, string>>
  customModel: boolean
  setCustomModel: (v: boolean) => void
}) {
  return (
    <div className="space-y-4">
      <Field label="Arena Name" error={errors.arenaName}>
        <input
          value={draft.arenaName}
          onChange={e => set('arenaName', e.target.value)}
          placeholder="e.g. CodeGen-GRPO-v1"
          className={inputCls(errors.arenaName)}
        />
      </Field>

      <div>
        <label className="text-[11px] text-muted block mb-2">Base Model</label>
        <div className="flex gap-2 mb-2">
          {[false, true].map(custom => (
            <button
              key={String(custom)}
              onClick={() => setCustomModel(custom)}
              className={`text-[11px] px-2.5 py-1 border transition-all ${customModel === custom ? 'border-purple/50 bg-purple/10 text-purple-400' : 'border-border text-muted hover:text-white'}`}
            >
              {custom ? 'Custom HF ID' : 'Popular Models'}
            </button>
          ))}
        </div>
        {!customModel ? (
          <select value={draft.modelRef} onChange={e => set('modelRef', e.target.value)} className={selectCls()}>
            {POPULAR_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input
            value={draft.modelRef}
            onChange={e => set('modelRef', e.target.value)}
            placeholder="org/model-name"
            className={inputCls(errors.modelRef)}
          />
        )}
        {errors.modelRef && <span className="text-[10px] text-red-400">{errors.modelRef}</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantization">
          <select value={draft.quantization} onChange={e => set('quantization', e.target.value as WizardDraft['quantization'])} className={selectCls()}>
            <option value="none">None (fp32/fp16)</option>
            <option value="nf4">NF4 (QLoRA)</option>
            <option value="int8">Int8</option>
          </select>
        </Field>
        <Field label="Data type">
          <select value={draft.dtype} onChange={e => set('dtype', e.target.value as WizardDraft['dtype'])} className={selectCls()}>
            <option value="bfloat16">bfloat16</option>
            <option value="float16">float16</option>
            <option value="float32">float32</option>
          </select>
        </Field>
      </div>
    </div>
  )
}

function Step2Gym({
  draft, set, errors, savedGyms,
}: {
  draft: WizardDraft
  set: <K extends keyof WizardDraft>(k: K, v: WizardDraft[K]) => void
  errors: Partial<Record<keyof WizardDraft, string>>
  savedGyms: { rootHash: string; name: string; savedAt: string }[]
}) {
  const [gymMode, setGymMode] = useState<'saved' | 'manual'>(savedGyms.length > 0 ? 'saved' : 'manual')

  return (
    <div className="space-y-5">
      {/* Gym selection */}
      <div>
        <label className="text-[11px] text-muted block mb-2">Training Gym</label>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setGymMode('saved')}
            className={`text-[11px] px-2.5 py-1 border transition-all ${gymMode === 'saved' ? 'border-purple/50 bg-purple/10 text-purple-400' : 'border-border text-muted hover:text-white'}`}
          >
            My Gyms ({savedGyms.length})
          </button>
          <button
            onClick={() => setGymMode('manual')}
            className={`text-[11px] px-2.5 py-1 border transition-all ${gymMode === 'manual' ? 'border-purple/50 bg-purple/10 text-purple-400' : 'border-border text-muted hover:text-white'}`}
          >
            Enter Root Hash
          </button>
        </div>

        {gymMode === 'saved' ? (
          savedGyms.length === 0 ? (
            <div className="p-4 border border-border text-center">
              <p className="text-[12px] text-muted">No saved gyms yet.</p>
              <p className="text-[11px] text-muted/60 mt-1">Build and publish a gym from the Gym Builder first.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-36 overflow-y-auto">
              {savedGyms.map(gym => (
                <div
                  key={gym.rootHash}
                  onClick={() => { set('gymHash', gym.rootHash); set('gymName', gym.name) }}
                  className={`p-3 border cursor-pointer transition-all ${draft.gymHash === gym.rootHash ? 'border-purple/50 bg-purple/10' : 'border-border hover:border-gray-500 bg-surface-2'}`}
                >
                  <div className="text-[12px] font-medium text-white">{gym.name}</div>
                  <div className="text-[10px] font-mono text-muted mt-0.5">{gym.rootHash.slice(0, 24)}…</div>
                  <div className="text-[10px] text-muted/60">{new Date(gym.savedAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )
        ) : (
          <input
            value={draft.gymHash}
            onChange={e => { set('gymHash', e.target.value); set('gymName', '') }}
            placeholder="0x…"
            className={inputCls(errors.gymHash)}
          />
        )}
        {errors.gymHash && <p className="text-[10px] text-red-400 mt-1">{errors.gymHash}</p>}
      </div>

      {/* Supervisor / Judge */}
      <div>
        <label className="text-[11px] text-muted block mb-2">Supervisor / Judge</label>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base URL">
              <input value={draft.judgeBaseUrl} onChange={e => set('judgeBaseUrl', e.target.value)} className={inputCls()} />
            </Field>
            <Field label="Model">
              <input value={draft.judgeModel} onChange={e => set('judgeModel', e.target.value)} className={inputCls()} />
            </Field>
          </div>
          <Field label="Scoring Rubric">
            <textarea
              value={draft.rubric}
              onChange={e => set('rubric', e.target.value)}
              rows={3}
              className={`${inputCls()} resize-none`}
            />
          </Field>
        </div>
      </div>

      {/* Data Sources — URIs the gym accesses at runtime; raw data never leaves your infrastructure */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="text-[11px] text-muted">Data Sources <span className="text-muted/50">(optional)</span></label>
            <p className="text-[10px] text-muted/50 mt-0.5">URIs passed to the gym as env vars — your data stays on-premises</p>
          </div>
          <button
            type="button"
            onClick={() => set('connectors', [...draft.connectors, { label: '', uri: '', mountEnv: '' }])}
            className="text-[11px] border border-border text-muted hover:text-white px-2 py-0.5 transition-colors"
          >
            + Add source
          </button>
        </div>
        {draft.connectors.length > 0 && (
          <div className="space-y-2">
            {draft.connectors.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2 items-center">
                <input
                  value={c.label}
                  onChange={e => set('connectors', draft.connectors.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  placeholder="Label"
                  className={inputCls()}
                />
                <input
                  value={c.uri}
                  onChange={e => set('connectors', draft.connectors.map((x, j) => j === i ? { ...x, uri: e.target.value } : x))}
                  placeholder="https://… or 0x…"
                  className={inputCls()}
                />
                <input
                  value={c.mountEnv}
                  onChange={e => set('connectors', draft.connectors.map((x, j) => j === i ? { ...x, mountEnv: e.target.value } : x))}
                  placeholder="ENV_VAR"
                  className={inputCls()}
                />
                <button
                  type="button"
                  onClick={() => set('connectors', draft.connectors.filter((_, j) => j !== i))}
                  className="text-muted hover:text-signal-red text-[13px] leading-none"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Step3Algorithm({
  draft, set,
}: {
  draft: WizardDraft
  set: <K extends keyof WizardDraft>(k: K, v: WizardDraft[K]) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] text-muted block mb-2">Algorithm</label>
        <div className="grid grid-cols-3 gap-2">
          {(['grpo', 'ppo', 'dpo'] as const).map(algo => (
            <button
              key={algo}
              onClick={() => set('algorithm', algo)}
              className={`py-3 border text-[13px] uppercase font-mono font-semibold transition-all ${draft.algorithm === algo ? 'border-purple/50 bg-purple/10 text-purple-400' : 'border-border text-muted hover:border-gray-500 hover:text-white'}`}
            >
              {algo}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Episodes">
          <input type="number" min={1} value={draft.numEpisodes} onChange={e => set('numEpisodes', parseInt(e.target.value) || 50)} className={inputCls()} />
        </Field>
        <Field label="Learning Rate">
          <input value={draft.learningRate} onChange={e => set('learningRate', e.target.value)} className={inputCls()} />
        </Field>
        <Field label="LoRA Rank">
          <input type="number" min={4} value={draft.loraRank} onChange={e => set('loraRank', parseInt(e.target.value) || 16)} className={inputCls()} />
        </Field>
        <Field label="Batch Size">
          <input type="number" min={1} value={draft.batchSize} onChange={e => set('batchSize', parseInt(e.target.value) || 1)} className={inputCls()} />
        </Field>
        <Field label="Max New Tokens">
          <input type="number" min={16} value={draft.maxNewTokens} onChange={e => set('maxNewTokens', parseInt(e.target.value) || 128)} className={inputCls()} />
        </Field>
        <Field label="KL Coefficient">
          <input value={draft.klCoef} onChange={e => set('klCoef', e.target.value)} className={inputCls()} />
        </Field>
      </div>
    </div>
  )
}

function Step4Review({
  draft, taskConfig, estimatedCost,
}: {
  draft: WizardDraft
  taskConfig: TaskConfig
  estimatedCost: bigint
}) {
  const [copied, setCopied] = useState(false)
  const json = JSON.stringify(taskConfig, null, 2)

  function copy() {
    navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const costDisplay = estimatedCost > 0n
    ? `${formatEther(estimatedCost)} 0G`
    : 'N/A (contracts not deployed)'

  const summary = [
    ['Arena',     draft.arenaName],
    ['Model',     draft.modelRef.split('/').pop() ?? draft.modelRef],
    ['Algorithm', draft.algorithm.toUpperCase()],
    ['Episodes',  String(draft.numEpisodes)],
    ['Gym',       draft.gymName || draft.gymHash.slice(0, 10) + '…'],
    ['Cost',      costDisplay],
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {summary.map(([k, v]) => (
          <div key={k} className="bg-surface-2 border border-border px-3 py-2 rounded">
            <div className="text-[10px] text-muted">{k}</div>
            <div className="text-[12px] font-medium text-white truncate">{v}</div>
          </div>
        ))}
      </div>

      <div className="border border-border rounded overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-2">
          <span className="text-[11px] font-mono text-muted">task.json</span>
          <button onClick={copy} className="text-[10px] text-muted hover:text-white transition-colors">
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <pre className="text-[10px] font-mono text-green/80 p-3 overflow-x-auto max-h-44 overflow-y-auto leading-relaxed">
          {json}
        </pre>
      </div>

      <div className="p-3 bg-amber/5 border border-amber/20 rounded text-[11px] text-amber/80">
        This arena will be added as pending. Actual 0G Compute job submission requires
        the core executor to be deployed and connected.
      </div>
    </div>
  )
}

// ── Shared form helpers ────────────────────────────────────────

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-muted">{label}</label>
      {children}
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  )
}

const inputBase = 'w-full px-3 py-2 text-[13px] bg-canvas border rounded-lg text-white placeholder:text-muted/50 focus:outline-none transition-colors'
function inputCls(err?: string) { return `${inputBase} ${err ? 'border-red-500/60 focus:border-red-400' : 'border-border focus:border-purple/60'}` }
function selectCls() { return `${inputBase} border-border focus:border-purple/60` }

// ── Metric / chart helpers ─────────────────────────────────────

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-surface-2 border border-border p-2.5">
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
