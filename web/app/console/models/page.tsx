'use client'

import { useState } from 'react'

const models = [
  {
    id: 'MDL-001',
    name: 'CodeGen-7B-RL-v3',
    base: 'Llama-3-7B',
    status: 'active',
    loraSize: '142 MB',
    loraStatus: 'stable',
    cid: 'bafybeig7k2x9...c7k2',
    blocks: 18420,
    cost: 412.4,
    arenas: ['ARN-001', 'ARN-007'],
    createdAt: '2026-04-18',
  },
  {
    id: 'MDL-002',
    name: 'TradingBot-Sigma-v2',
    base: 'Mistral-8x7B',
    status: 'active',
    loraSize: '380 MB',
    loraStatus: 'training',
    cid: 'bafybeid9xm4...e2r1',
    blocks: 32100,
    cost: 890.2,
    arenas: ['ARN-004'],
    createdAt: '2026-04-12',
  },
  {
    id: 'MDL-003',
    name: 'RoboSim-Gemma',
    base: 'Gemma-2B',
    status: 'paused',
    loraSize: '64 MB',
    loraStatus: 'stable',
    cid: 'bafybeih3p1...n3k7',
    blocks: 7830,
    cost: 184.0,
    arenas: ['ARN-002'],
    createdAt: '2026-04-05',
  },
  {
    id: 'MDL-004',
    name: 'MathReasoner-Qwen',
    base: 'Qwen-1.5B',
    status: 'active',
    loraSize: '48 MB',
    loraStatus: 'stable',
    cid: 'bafybeif5lz9...8mn2',
    blocks: 5600,
    cost: 120.8,
    arenas: ['ARN-011'],
    createdAt: '2026-04-22',
  },
]

export default function ModelsPage() {
  const [selected, setSelected] = useState(models[0])
  const [lineageOpen, setLineageOpen] = useState(false)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Model list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h1 className="text-base font-semibold text-white">Models</h1>
            <p className="text-[11px] text-muted">Trained assets and LoRA weight inventory</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-[11px] px-3 py-1.5 border border-border rounded-lg text-muted hover:text-white hover:border-gray-500 transition-colors">
              Export All
            </button>
            <button className="text-[11px] px-3 py-1.5 bg-purple hover:bg-purple/80 text-white rounded-lg font-medium transition-colors">
              List on Marketplace
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-space border-b border-border">
              <tr>
                {['Model','Base','LoRA Weights','0G Storage CID','Blocks Used','Cost (0G)','Status'].map((h, i) => (
                  <th key={h} className={`text-[10px] text-muted font-medium px-4 py-2.5 uppercase tracking-wider ${i >= 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map(m => (
                <tr
                  key={m.id}
                  onClick={() => setSelected(m)}
                  className={`border-b border-border cursor-pointer transition-colors ${selected.id === m.id ? 'bg-purple/10 border-l-2 border-l-purple' : 'hover:bg-surface-2'}`}
                >
                  <td className="px-4 py-3">
                    <div className="text-[13px] font-semibold text-white">{m.name}</div>
                    <div className="text-[10px] font-mono text-muted">{m.id} · {m.createdAt}</div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-gray-400">{m.base}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-white font-mono">{m.loraSize}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.loraStatus === 'training' ? 'bg-amber/10 text-amber' : 'bg-green/10 text-green'}`}>
                        {m.loraStatus}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono text-muted">{m.cid}</td>
                  <td className="px-4 py-3 text-right text-[12px] font-mono text-white">{m.blocks.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-[12px] font-mono text-amber">{m.cost.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${m.status === 'active' ? 'bg-green/10 text-green' : 'bg-border text-muted'}`}>
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      <div className="w-72 border-l border-border bg-surface shrink-0 flex flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b border-border">
          <div className="text-sm font-semibold text-white">{selected.name}</div>
          <div className="text-[11px] text-muted font-mono mt-0.5">{selected.id}</div>
        </div>

        <div className="p-4 space-y-5">
          {/* Details */}
          <div className="space-y-2">
            <InfoRow label="Base Model"  value={selected.base} />
            <InfoRow label="LoRA Size"   value={selected.loraSize} />
            <InfoRow label="LoRA Status" value={selected.loraStatus} highlight={selected.loraStatus === 'training' ? 'amber' : 'green'} />
            <InfoRow label="Created"     value={selected.createdAt} />
          </div>

          {/* Storage CID */}
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5">0G Storage CID</div>
            <div className="bg-surface-2 border border-border rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-gray-300 truncate">{selected.cid}</span>
              <button className="shrink-0 text-[10px] text-purple-400 hover:text-purple-300 transition-colors">Copy</button>
            </div>
          </div>

          {/* Cost analysis */}
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wider mb-2">Cost Analysis</div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[12px]">
                <span className="text-muted">Blocks consumed</span>
                <span className="font-mono text-white">{selected.blocks.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted">Total cost</span>
                <span className="font-mono text-amber">{selected.cost.toFixed(1)} 0G</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-muted">Arenas</span>
                <span className="text-white">{selected.arenas.join(', ')}</span>
              </div>
            </div>
          </div>

          {/* Training lineage */}
          <div>
            <button
              onClick={() => setLineageOpen(o => !o)}
              className="w-full flex items-center justify-between text-[11px] text-muted hover:text-white transition-colors"
            >
              <span className="uppercase tracking-wider">Training Lineage</span>
              <span>{lineageOpen ? '▲' : '▼'}</span>
            </button>
            {lineageOpen && (
              <div className="mt-2 space-y-1 border-l-2 border-border pl-3">
                {['Base checkpoint', 'Gym PythonCoding-v3', 'RLAIF: GPT-4o judge', 'LoRA merge #1 (ARN-001)', 'Federated merge #142', 'Current weights'].map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple shrink-0" />
                    <span className="text-gray-400">{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button className="w-full text-[12px] py-1.5 rounded-lg bg-purple hover:bg-purple/80 text-white font-medium transition-colors">
              Export LoRA Weights
            </button>
            <button className="w-full text-[12px] py-1.5 rounded-lg border border-border text-muted hover:text-white hover:border-gray-500 transition-colors">
              Merge Weights
            </button>
            <button className="w-full text-[12px] py-1.5 rounded-lg border border-green/30 text-green hover:bg-green/10 transition-colors">
              List on Marketplace
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: 'green' | 'amber' }) {
  return (
    <div className="flex justify-between items-center text-[12px]">
      <span className="text-muted">{label}</span>
      <span className={highlight === 'green' ? 'text-green' : highlight === 'amber' ? 'text-amber' : 'text-white'}>{value}</span>
    </div>
  )
}
