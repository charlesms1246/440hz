'use client'

import { useProfileStore } from '@/lib/profileStore'

const sparkData = [28, 45, 32, 60, 48, 72, 55, 80, 63, 88, 71, 95, 78, 102, 85, 118, 92, 108, 97, 124]

// ── Tuner data ────────────────────────────────────────────────
const topArenas = [
  { id: 'ARN-001', name: 'CodeGen-7B-RL',    model: 'Llama-3-7B',   reward: 94.2, delta: '+2.1', status: 'running' },
  { id: 'ARN-004', name: 'TradingBot-Sigma',  model: 'Mistral-8x7B', reward: 87.6, delta: '+0.8', status: 'running' },
  { id: 'ARN-002', name: 'RoboSim-Physics',   model: 'Gemma-2B',     reward: 73.1, delta: '-1.3', status: 'paused'  },
  { id: 'ARN-007', name: 'PythonTutor-v2',    model: 'Phi-3-mini',   reward: 68.9, delta: '+3.4', status: 'running' },
]

// ── Builder data ───────────────────────────────────────────────
const ownedGyms = [
  { name: 'PythonCoding-v3', downloads: 8320, revenue: 412.4,   license: 'Open'       },
  { name: 'MarketSim-v2',    downloads: 1670, revenue: 1240.0,  license: 'Pro'        },
  { name: 'MathEnv-v1',      downloads: 5410, revenue: 0,       license: 'Open'       },
]

// ── Provider data ──────────────────────────────────────────────
const computeStats = {
  uptime: '99.7%',
  cycles: '2.4M',
  gpuUtil: 78,
  yield: 184.2,
  rank: 14,
  peers: 340,
}

export default function OverviewPage() {
  const { persona } = useProfileStore()

  return (
    <div className="p-6 space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Command Center</h1>
          <p className="text-xs text-muted mt-0.5">
            {persona === 'tuner'    ? 'Training telemetry and financial health'
           : persona === 'builder'  ? 'Marketplace analytics and royalty earnings'
           :                         'Hardware uptime and yield metrics'}
          </p>
        </div>
        <ModeBadge persona={persona} />
      </div>

      {/* Universal widgets */}
      <div className="grid grid-cols-3 gap-4">
        {/* Network Status */}
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted uppercase tracking-wider">Network Status</span>
            <span className="flex items-center gap-1 text-[11px] text-green bg-green/10 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />In-Sync
            </span>
          </div>
          <div className="space-y-2">
            <ShardRow label="0G DA Layer"  latency="12ms" ok />
            <ShardRow label="0G Storage"   latency="28ms" ok />
            <ShardRow label="0G Compute"   latency="67ms" ok={false} />
          </div>
          <div className="text-[11px] text-muted">Last ping: 2s ago</div>
        </div>

        {/* Middle card — persona-specific */}
        {persona === 'tuner' && (
          <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
            <span className="text-xs text-muted uppercase tracking-wider">Active Arenas</span>
            <div className="flex items-end gap-4">
              <div><div className="text-3xl font-bold text-white">4</div><div className="text-[11px] text-muted">Running local</div></div>
              <div className="w-px h-10 bg-border" />
              <div><div className="text-3xl font-bold text-purple-400">12</div><div className="text-[11px] text-muted">Global swarm</div></div>
            </div>
            <div className="space-y-1.5">
              <MiniBar label="Training"    value={75} color="bg-purple" />
              <MiniBar label="Aggregating" value={42} color="bg-amber" />
              <MiniBar label="Deploying"   value={18} color="bg-green" />
            </div>
          </div>
        )}
        {persona === 'builder' && (
          <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
            <span className="text-xs text-muted uppercase tracking-wider">Gym Marketplace</span>
            <div className="flex items-end gap-4">
              <div><div className="text-3xl font-bold text-white">3</div><div className="text-[11px] text-muted">Published gyms</div></div>
              <div className="w-px h-10 bg-border" />
              <div><div className="text-3xl font-bold text-purple-400">15.4k</div><div className="text-[11px] text-muted">Total downloads</div></div>
            </div>
            <div className="space-y-1.5">
              <MiniBar label="PythonCoding" value={82} color="bg-purple" />
              <MiniBar label="MarketSim"    value={54} color="bg-amber" />
              <MiniBar label="MathEnv"      value={35} color="bg-green" />
            </div>
          </div>
        )}
        {persona === 'provider' && (
          <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
            <span className="text-xs text-muted uppercase tracking-wider">Node Health</span>
            <div className="flex items-end gap-4">
              <div><div className="text-3xl font-bold text-green">{computeStats.uptime}</div><div className="text-[11px] text-muted">Uptime</div></div>
              <div className="w-px h-10 bg-border" />
              <div><div className="text-3xl font-bold text-purple-400">{computeStats.cycles}</div><div className="text-[11px] text-muted">Cycles total</div></div>
            </div>
            <div className="space-y-1.5">
              <MiniBar label="GPU Util"  value={computeStats.gpuUtil} color="bg-purple" />
              <MiniBar label="Rank"      value={Math.round((1 - computeStats.rank / computeStats.peers) * 100)} color="bg-green" />
            </div>
          </div>
        )}

        {/* Wallet */}
        <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted uppercase tracking-wider">Wallet</span>
            <span className="text-[11px] text-green">+12.4% 24h</span>
          </div>
          <div>
            <div className="text-3xl font-bold text-white font-mono">2,847.3</div>
            <div className="text-[11px] text-muted">0G tokens</div>
          </div>
          <div className="flex items-end gap-0.5 h-12">
            {sparkData.map((v, i) => {
              const h = Math.round((v / Math.max(...sparkData)) * 100)
              return (
                <div key={i} className={`flex-1 rounded-sm ${i === sparkData.length - 1 ? 'bg-green' : 'bg-purple/50'}`}
                  style={{ height: `${h}%` }} />
              )
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted"><span>24h ago</span><span>Now</span></div>
        </div>
      </div>

      {/* Persona-specific main table */}
      {persona === 'tuner' && <TunerTable />}
      {persona === 'builder' && <BuilderTable />}
      {persona === 'provider' && <ProviderTable />}
    </div>
  )
}

// ── Tuner: top arenas ──────────────────────────────────────────
function TunerTable() {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-white">Top Performing Arenas</span>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span>Avg reward convergence: <span className="text-purple-400">+1.7</span></span>
          <button className="text-purple-400 hover:text-purple-300 transition-colors">View all →</button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border">
          {['ID','Name','Base Model','Reward','24h Δ','Status'].map((h, i) => (
            <th key={h} className={`text-[11px] text-muted font-medium px-4 py-2.5 ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {topArenas.map(a => (
            <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors cursor-pointer">
              <td className="px-4 py-3 font-mono text-[11px] text-muted">{a.id}</td>
              <td className="px-4 py-3 text-[13px] font-medium text-white">{a.name}</td>
              <td className="px-4 py-3 text-[12px] text-muted">{a.model}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-purple rounded-full" style={{ width: `${a.reward}%` }} />
                  </div>
                  <span className="text-[12px] font-mono text-white w-10 text-right">{a.reward}</span>
                </div>
              </td>
              <td className={`px-4 py-3 text-right text-[12px] font-mono ${a.delta.startsWith('+') ? 'text-green' : 'text-signal-red'}`}>{a.delta}</td>
              <td className="px-4 py-3 text-right"><StatusBadge status={a.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Builder: gym royalties ─────────────────────────────────────
function BuilderTable() {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-white">Gym Royalty Dashboard</span>
        <span className="text-[11px] text-green">Total earned: <span className="font-mono">1,652.4 0G</span></span>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border">
          {['Gym','License','Downloads','Revenue (0G)','Trend'].map((h, i) => (
            <th key={h} className={`text-[11px] text-muted font-medium px-4 py-2.5 ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {ownedGyms.map(g => (
            <tr key={g.name} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors cursor-pointer">
              <td className="px-4 py-3 text-[13px] font-medium text-white">{g.name}</td>
              <td className="px-4 py-3">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${g.license === 'Open' ? 'border-green/30 bg-green/10 text-green' : 'border-purple/30 bg-purple/10 text-purple-400'}`}>{g.license}</span>
              </td>
              <td className="px-4 py-3 text-right text-[12px] font-mono text-white">{g.downloads.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-[12px] font-mono text-green">{g.revenue > 0 ? g.revenue.toFixed(1) : '—'}</td>
              <td className="px-4 py-3 text-right"><MiniSparkline /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Provider: compute stats ────────────────────────────────────
function ProviderTable() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <span className="text-sm font-medium text-white">Yield & Earnings</span>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="24h Yield" value="184.2 0G" color="text-green" />
          <StatCard label="7d Yield"  value="1,204.8 0G" color="text-green" />
          <StatCard label="Rank"      value="#14 / 340" color="text-purple-400" />
          <StatCard label="Efficiency" value="94.2%" color="text-white" />
        </div>
      </div>
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <span className="text-sm font-medium text-white">Hardware Metrics</span>
        <div className="space-y-3">
          <MiniBar label="GPU Utilization" value={78}  color="bg-purple" />
          <MiniBar label="CPU Load"        value={45}  color="bg-green" />
          <MiniBar label="VRAM"            value={58}  color="bg-amber" />
          <MiniBar label="Network I/O"     value={32}  color="bg-purple/60" />
        </div>
      </div>
    </div>
  )
}

// ── Shared components ──────────────────────────────────────────
function ModeBadge({ persona }: { persona: string }) {
  const map: Record<string, { label: string; color: string }> = {
    tuner:    { label: 'LLM Tuner Mode',       color: 'border-purple/30 bg-purple/10 text-purple-400' },
    builder:  { label: 'Gym Builder Mode',      color: 'border-green/30 bg-green/10 text-green' },
    provider: { label: 'Compute Provider Mode', color: 'border-amber/30 bg-amber/10 text-amber' },
  }
  const { label, color } = map[persona]
  return <span className={`text-[11px] px-3 py-1 rounded-full border font-medium ${color}`}>{label}</span>
}

function ShardRow({ label, latency, ok }: { label: string; latency: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono text-muted">{latency}</span>
        <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green' : 'bg-amber'}`} />
      </div>
    </div>
  )
}

function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[11px] font-mono text-muted w-7 text-right">{value}%</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return status === 'running'
    ? <span className="inline-flex items-center gap-1 text-[10px] bg-green/10 text-green px-2 py-0.5 rounded-full"><span className="w-1 h-1 rounded-full bg-green" />Running</span>
    : <span className="inline-flex items-center gap-1 text-[10px] bg-amber/10 text-amber px-2 py-0.5 rounded-full"><span className="w-1 h-1 rounded-full bg-amber" />Paused</span>
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-surface-2 border border-border rounded-lg p-3">
      <div className="text-[10px] text-muted mb-1">{label}</div>
      <div className={`text-[14px] font-mono font-bold ${color}`}>{value}</div>
    </div>
  )
}

function MiniSparkline() {
  const d = [30, 42, 38, 55, 50, 65, 60, 72]
  const max = Math.max(...d)
  const pts = d.map((v, i) => `${(i / (d.length - 1)) * 60},${20 - (v / max) * 18}`).join(' ')
  return (
    <svg viewBox="0 0 60 20" className="w-16 h-5">
      <polyline points={pts} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
