'use client'

import { useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { useRouter } from 'next/navigation'
import { useProfileStore, type Persona } from '@/lib/profileStore'

const personas: { id: Persona; label: string; icon: string }[] = [
  { id: 'tuner',    label: 'LLM Tuner',        icon: '⚡' },
  { id: 'builder',  label: 'Gym Builder',       icon: '🏗️' },
  { id: 'provider', label: 'Compute Provider',  icon: '🖥️' },
]

export default function SettingsPage() {
  const { address, chainId } = useAccount()
  const { disconnect } = useDisconnect()
  const router = useRouter()
  const { username, persona, setUsername, setPersona, reset } = useProfileStore()

  const [editName, setEditName] = useState(username)
  const [nameError, setNameError] = useState('')
  const [nameSaved, setNameSaved] = useState(false)
  const [theme] = useState<'dark'>('dark')

  const [notifications, setNotifications] = useState({
    merges: true,
    purchases: true,
    errors: true,
    rewards: false,
  })

  function saveName() {
    const t = editName.trim()
    if (t.length < 3) { setNameError('Min 3 characters'); return }
    if (!/^[a-z0-9_-]+$/i.test(t)) { setNameError('Only letters, numbers, _ and -'); return }
    setUsername(t)
    setNameError('')
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 2000)
  }

  function handleDisconnect() {
    reset()
    disconnect()
    router.push('/onboarding')
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-base font-semibold text-white">Settings</h1>
        <p className="text-[11px] text-muted mt-0.5">Account management and application preferences</p>
      </div>

      {/* Profile */}
      <Section title="Profile">
        <div className="space-y-4">
          <div>
            <label className="text-[11px] text-muted uppercase tracking-wider block mb-1.5">Username</label>
            <div className="flex gap-2">
              <input
                value={editName}
                onChange={e => { setEditName(e.target.value); setNameError(''); setNameSaved(false) }}
                className="flex-1 bg-surface-2 border border-border focus:border-purple/50 rounded-lg px-3 py-2 text-sm text-white outline-none transition-colors"
              />
              <button
                onClick={saveName}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${nameSaved ? 'bg-green/20 border border-green/30 text-green' : 'bg-purple hover:bg-purple/80 text-white'}`}
              >
                {nameSaved ? '✓ Saved' : 'Save'}
              </button>
            </div>
            {nameError && <p className="text-xs text-signal-red mt-1">{nameError}</p>}
          </div>

          <div>
            <label className="text-[11px] text-muted uppercase tracking-wider block mb-1.5">Connected Wallet</label>
            <div className="bg-surface-2 border border-border rounded-lg px-3 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-mono text-white">{address}</div>
                <div className="text-[11px] text-muted mt-0.5">
                  Chain ID: {chainId} · 0G Galileo Testnet
                </div>
              </div>
              <a
                href={`https://chainscan-galileo.0g.ai/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors shrink-0 ml-3"
              >
                View ↗
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* Role Switcher */}
      <Section title="Default Role">
        <p className="text-[11px] text-muted mb-3">Sets your default Overview dashboard. Toggle anytime in the header.</p>
        <div className="grid grid-cols-3 gap-3">
          {personas.map(p => (
            <button
              key={p.id}
              onClick={() => setPersona(p.id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${persona === p.id ? 'border-purple bg-purple/10' : 'border-border bg-surface-2 hover:border-gray-600'}`}
            >
              <span className="text-2xl">{p.icon}</span>
              <span className={`text-[12px] font-medium ${persona === p.id ? 'text-purple-400' : 'text-gray-400'}`}>{p.label}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* App Preferences */}
      <Section title="App Preferences">
        <div className="space-y-4">
          <div>
            <label className="text-[11px] text-muted uppercase tracking-wider block mb-2">Theme</label>
            <div className="flex gap-2">
              {['Dark', 'Light'].map(t => (
                <button
                  key={t}
                  disabled={t === 'Light'}
                  className={`px-4 py-1.5 rounded-lg text-sm border transition-all ${t === 'Dark' ? 'border-purple bg-purple/10 text-purple-400' : 'border-border text-muted opacity-40 cursor-not-allowed'}`}
                >
                  {t}{t === 'Light' ? ' (soon)' : ''}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted uppercase tracking-wider block mb-2">Notifications</label>
            <div className="space-y-2">
              {([
                ['merges',    'Successful LoRA merges'],
                ['purchases', 'Gym purchases & licenses'],
                ['errors',    'Training errors & crashes'],
                ['rewards',   'Reward threshold alerts'],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">{label}</span>
                  <div
                    onClick={() => setNotifications(n => ({ ...n, [key]: !n[key] }))}
                    className={`relative w-9 h-5 rounded-full cursor-pointer transition-colors ${notifications[key] ? 'bg-purple' : 'bg-border'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${notifications[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted uppercase tracking-wider block mb-1.5">Local Storage Limit</label>
            <div className="flex items-center gap-3">
              <input type="range" min={10} max={500} defaultValue={100} className="flex-1 accent-purple" />
              <span className="text-sm font-mono text-white w-16 text-right">100 GB</span>
            </div>
          </div>
        </div>
      </Section>

      {/* Danger zone */}
      <Section title="Disconnect">
        <p className="text-[11px] text-muted mb-4">Signing out will disconnect your wallet and clear your local session. Your on-chain data remains intact.</p>
        <button
          onClick={handleDisconnect}
          className="px-5 py-2 rounded-lg border border-signal-red/40 text-signal-red hover:bg-signal-red/10 transition-colors text-sm font-medium"
        >
          Disconnect Wallet & Sign Out
        </button>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white mb-4 pb-3 border-b border-border">{title}</h2>
      {children}
    </div>
  )
}
