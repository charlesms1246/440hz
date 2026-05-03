'use client'

import { useState, useEffect, type ReactNode } from 'react'
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
      <ArenaList
        arenas={arenas}
        selected={selected}
        setSelected={setSelected}
        filter={filter}
        setFilter={setFilter}
        onNew={() => setWizardOpen(true)}
      />
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
}: {
  arenas: Arena[]
  selected: Arena
  setSelected: (a: Arena) => void
  filter: 'All' | 'Running' | 'Paused' | 'Pending'
  setFilter: (f: 'All' | 'Running' | 'Paused' | 'Pending') => void
  onNew: () => void
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: '100%' }}>
      <div className="page-head">
        <div>
          <h1 className="page-title"><em>Arenas</em></h1>
          {/* <p className="page-sub">Active reinforcement learning sessions</p> */}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onNew} className="btn sm">+ New Arena</button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {(['All', 'Running', 'Paused', 'Pending'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 14px', borderRadius: 999, background: filter === f ? 'var(--accent-soft)' : 'transparent', border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`, color: filter === f ? 'var(--accent-2)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            {f}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>
          {counts.running} running · {counts.paused} paused{counts.pending > 0 && ` · ${counts.pending} pending`}
        </span>
      </div>

      {/* Table + detail */}
      <div style={{ display: 'flex', gap: 18, alignItems: 'stretch', flex: 1 }}>
        <div className="card" style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 128, fontSize: 12, color: 'var(--text-3)' }}>
              No arenas match this filter
            </div>
          ) : (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Arena', 'Model', 'Gym', 'Reward', 'Loss', 'Uptime'].map((h, i) => (
                    <th key={h} style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500, padding: '10px 14px', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i >= 3 ? 'right' : 'left' }}>
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
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected.id === a.id ? 'var(--accent-soft)' : 'transparent', borderLeft: selected.id === a.id ? '2px solid var(--accent)' : '2px solid transparent' }}
                    onMouseEnter={e => { if (selected.id !== a.id) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hi)'; }}
                    onMouseLeave={e => { if (selected.id !== a.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <StatusDot status={a.status} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
                          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{a.id}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-2)' }}>{a.model}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-2)' }}>{a.gym}</td>
                    <td className="mono" style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12 }}>{a.status === 'pending' ? '—' : a.reward.toFixed(1)}</td>
                    <td className="mono" style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, color: 'var(--text-2)' }}>{a.status === 'pending' ? '—' : a.loss.toFixed(3)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-3)' }}>{a.uptime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right: detail panel — 360px wide, stretches full height */}
        <div style={{ width: 360, flexShrink: 0 }}>
          <ArenaDetailPanel arena={selected} />
        </div>
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: ArenaStatus }) {
  const color = { running: 'var(--ok)', paused: 'var(--warn)', pending: 'var(--info)', failed: 'var(--danger)' }[status]
  return <span className="dot" style={{ background: color, flexShrink: 0 }} />
}

// ── Arena detail panel ─────────────────────────────────────────

function ArenaDetailPanel({ arena }: { arena: Arena }) {
  const [taskOpen, setTaskOpen] = useState(false)

  return (
    <div className="card" style={{ height: '100%', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{arena.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <StatusDot status={arena.status} />
          <span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'capitalize' }}>
            {arena.status} · {arena.uptime}
          </span>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1, overflowY: 'auto' }}>
        {arena.status === 'pending' ? (
          <div style={{ padding: 10, border: '1px solid var(--info)', borderRadius: 8, background: 'oklch(0.75 0.12 230 / 0.08)' }}>
            <p style={{ fontSize: 11, color: 'var(--info)' }}>
              Arena queued. Awaiting 0G Compute executor deployment.
            </p>
            {arena.taskJson && (
              <button onClick={() => setTaskOpen(t => !t)} style={{ marginTop: 6, fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {taskOpen ? '▲ Hide' : '▼ View'} task.json
              </button>
            )}
            {taskOpen && arena.taskJson && (
              <pre style={{ marginTop: 6, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ok)', overflowX: 'auto', maxHeight: 192, overflowY: 'auto', lineHeight: 1.6 }}>
                {JSON.stringify(arena.taskJson, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Metric label="Reward" value={arena.reward.toFixed(1)} color="var(--ok)" />
              <Metric label="Loss"   value={arena.loss.toFixed(3)}   color="var(--warn)" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Reward Curve</div>
              <MiniChart color="oklch(0.78 0.14 150)" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Loss Curve</div>
              <MiniChart color="oklch(0.80 0.14 75)" descending />
            </div>
          </>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['Judge', arena.judge],
            ['Gym',   arena.gym],
            ...(arena.status !== 'pending' ? [['LR', '3e-5'], ['KL', '0.02']] : []),
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--text-3)' }}>{k}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', marginLeft: 8, maxWidth: 100, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>

        {arena.status !== 'pending' && (
          <button className="btn sm" style={{ width: '100%', justifyContent: 'center' }}>Deploy to Swarm</button>
        )}
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
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 620, maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>New Arena</h2>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Configure your RL training run</p>
          </div>
          <button onClick={onClose} style={{ fontSize: 20, lineHeight: 1, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
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
    <div style={{ background: 'var(--surface-hi)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{label}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
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
