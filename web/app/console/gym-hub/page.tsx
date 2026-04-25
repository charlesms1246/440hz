'use client'

import { useState } from 'react'

const categories = ['All', 'Coding', 'Trading', 'Physics', 'Robotics', 'Math', 'Language']

const ownedGyms = [
  { id: 'GYM-C01', name: 'PythonCoding-v3', category: 'Coding', complexity: 72, cid: 'bafybeig...c7k2', license: 'Open', size: '1.4 GB', version: 'v3.1.0' },
  { id: 'GYM-T02', name: 'MarketSim-v2', category: 'Trading', complexity: 85, cid: 'bafybeid...9xm4', license: 'Pro', size: '3.2 GB', version: 'v2.4.1' },
  { id: 'GYM-M01', name: 'MathEnv-v1', category: 'Math', complexity: 55, cid: 'bafybeih...n3p1', license: 'Open', size: '0.8 GB', version: 'v1.0.3' },
]

const marketGyms = [
  { id: 'GYM-R03', name: 'RoboticsLab-v2', category: 'Robotics', complexity: 94, cid: 'bafybeie...8qr2', license: 'Enterprise', cost: '500 $440', rating: 4.8, downloads: 1240 },
  { id: 'GYM-C02', name: 'CodingGym-v2', category: 'Coding', complexity: 68, cid: 'bafybeif...3lz9', license: 'Open', cost: 'Free', rating: 4.6, downloads: 8320 },
  { id: 'GYM-P01', name: 'PhysicsSim-v1', category: 'Physics', complexity: 88, cid: 'bafybeig...7mn5', license: 'Pro', cost: '120 $440', rating: 4.7, downloads: 2890 },
  { id: 'GYM-T03', name: 'ForexTrader-v1', category: 'Trading', complexity: 91, cid: 'bafybeih...2kp8', license: 'Pro', cost: '250 $440', rating: 4.5, downloads: 1670 },
  { id: 'GYM-L01', name: 'DialogueEnv-v1', category: 'Language', complexity: 62, cid: 'bafybeia...5xq3', license: 'Open', cost: 'Free', rating: 4.3, downloads: 5410 },
  { id: 'GYM-M02', name: 'AdvMath-v2', category: 'Math', complexity: 97, cid: 'bafybeib...1rw7', license: 'Enterprise', cost: '800 $440', rating: 4.9, downloads: 340 },
]

export default function GymHubPage() {
  const [tab, setTab] = useState<'owned' | 'marketplace'>('marketplace')
  const [category, setCategory] = useState('All')
  const [purchasing, setPurchasing] = useState<string | null>(null)

  const filtered = marketGyms.filter(g => category === 'All' || g.category === category)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-white">Gym Hub</h1>
            <p className="text-[11px] text-muted">Browse and manage training environments</p>
          </div>
          {/* Tabs */}
          <div className="flex bg-surface-2 rounded-lg p-0.5">
            {(['owned', 'marketplace'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-[12px] font-medium px-4 py-1.5 rounded-md transition-all capitalize ${tab === t ? 'bg-surface text-white shadow' : 'text-muted hover:text-gray-300'}`}
              >
                {t === 'owned' ? `Owned (${ownedGyms.length})` : 'Marketplace'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category filters (marketplace only) */}
      {tab === 'marketplace' && (
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border overflow-x-auto">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`text-[11px] whitespace-nowrap px-3 py-1.5 rounded-full border transition-all ${category === c ? 'border-purple bg-purple/10 text-purple-400' : 'border-border text-muted hover:text-white hover:border-gray-500'}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'owned' ? (
          <div className="grid grid-cols-3 gap-4">
            {ownedGyms.map(gym => (
              <OwnedCard key={gym.id} gym={gym} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filtered.map(gym => (
              <MarketCard
                key={gym.id}
                gym={gym}
                purchasing={purchasing === gym.id}
                onPurchase={() => {
                  setPurchasing(gym.id)
                  setTimeout(() => setPurchasing(null), 2000)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ComplexityBar({ value }: { value: number }) {
  const color = value >= 90 ? 'bg-signal-red' : value >= 70 ? 'bg-amber' : 'bg-green'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted w-6">{value}</span>
    </div>
  )
}

function OwnedCard({ gym }: { gym: typeof ownedGyms[0] }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 hover:border-gray-600 transition-colors group">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-purple/20 flex items-center justify-center text-lg">🏟️</div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${gym.license === 'Open' ? 'border-green/30 bg-green/10 text-green' : 'border-purple/30 bg-purple/10 text-purple-400'}`}>
          {gym.license}
        </span>
      </div>
      <div className="text-[13px] font-semibold text-white mb-0.5">{gym.name}</div>
      <div className="text-[11px] text-muted mb-3">{gym.category} · {gym.version}</div>
      <div className="mb-2">
        <div className="flex justify-between text-[10px] text-muted mb-1">
          <span>Complexity</span>
        </div>
        <ComplexityBar value={gym.complexity} />
      </div>
      <div className="text-[10px] font-mono text-muted truncate mb-3">CID: {gym.cid}</div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted">{gym.size}</span>
        <button className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors">Launch →</button>
      </div>
    </div>
  )
}

function MarketCard({ gym, purchasing, onPurchase }: { gym: typeof marketGyms[0]; purchasing: boolean; onPurchase: () => void }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center text-lg">
          {gym.category === 'Coding' ? '💻' : gym.category === 'Trading' ? '📈' : gym.category === 'Physics' ? '⚛️' : gym.category === 'Robotics' ? '🤖' : gym.category === 'Math' ? '🧮' : '💬'}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${gym.license === 'Open' ? 'border-green/30 bg-green/10 text-green' : gym.license === 'Enterprise' ? 'border-amber/30 bg-amber/10 text-amber' : 'border-purple/30 bg-purple/10 text-purple-400'}`}>
          {gym.license}
        </span>
      </div>
      <div className="text-[13px] font-semibold text-white mb-0.5">{gym.name}</div>
      <div className="text-[11px] text-muted mb-3">{gym.category}</div>
      <div className="mb-2">
        <div className="text-[10px] text-muted mb-1">Complexity</div>
        <ComplexityBar value={gym.complexity} />
      </div>
      <div className="text-[10px] font-mono text-muted truncate mb-3">CID: {gym.cid}</div>
      <div className="flex items-center justify-between text-[11px] text-muted mb-3">
        <span>⭐ {gym.rating}</span>
        <span>{gym.downloads.toLocaleString()} pulls</span>
      </div>
      <button
        onClick={onPurchase}
        className={`w-full text-[12px] py-1.5 rounded-lg font-medium transition-all ${
          purchasing
            ? 'bg-green/20 text-green border border-green/30'
            : gym.cost === 'Free'
            ? 'bg-green hover:bg-green/80 text-white'
            : 'bg-purple hover:bg-purple/80 text-white'
        }`}
      >
        {purchasing ? '⬇ Pulling from 0G Storage...' : gym.cost === 'Free' ? 'Download Free' : `License · ${gym.cost}`}
      </button>
    </div>
  )
}
