'use client'

import { useState, useEffect } from 'react'
import { useConnect, useAccount, useDisconnect, useSwitchChain } from 'wagmi'
import { useRouter } from 'next/navigation'
import { useProfileStore, type Persona } from '@/lib/profileStore'
import { zeroGGalileo } from '@/lib/wagmi'
import { Logo440hz } from '@/app/_components/Logo440hz'
import { ThemeToggle } from '@/app/_components/ThemeToggle'

const personas: { id: Persona; label: string; icon: string; desc: string }[] = [
  { id: 'tuner',    label: 'LLM Tuner',        icon: '⚡', desc: 'Train and fine-tune models via RLHF arenas. Earn rewards for performant agents.' },
  { id: 'builder',  label: 'Gym Builder',       icon: '🏗️', desc: 'Design and publish custom training environments. Earn royalties from licenses.' },
  { id: 'provider', label: 'Compute Provider',  icon: '🖥️', desc: 'Contribute GPU/CPU cycles to the 0G swarm. Earn yield for uptime and throughput.' },
]

export default function OnboardingPage() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const router = useRouter()

  const { username, persona, onboardingComplete, setUsername, setPersona, completeOnboarding } = useProfileStore()

  const [step, setStep] = useState(0)
  const [inputName, setInputName] = useState(username)
  const [nameError, setNameError] = useState('')
  const [networkOk, setNetworkOk] = useState(false)
  const [checking, setChecking] = useState(false)

  // If already onboarded, go straight to console
  useEffect(() => {
    if (onboardingComplete && isConnected) {
      router.push('/console/overview')
    }
  }, [onboardingComplete, isConnected, router])

  // Advance to step 1 once wallet is connected
  useEffect(() => {
    if (isConnected && step === 0) setStep(1)
  }, [isConnected, step])

  const wrongChain = isConnected && chainId !== zeroGGalileo.id

  function handleNameNext() {
    const trimmed = inputName.trim()
    if (trimmed.length < 3) { setNameError('Username must be at least 3 characters'); return }
    if (!/^[a-z0-9_-]+$/i.test(trimmed)) { setNameError('Only letters, numbers, _ and - are allowed'); return }
    setNameError('')
    setUsername(trimmed)
    setStep(2)
  }

  async function handleFinish() {
    setChecking(true)
    // Network provisioning: ping 0G DA endpoint
    try {
      await fetch('https://evmrpc-testnet.0g.ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'net_version', params: [], id: 1 }),
      })
      setNetworkOk(true)
    } catch {
      setNetworkOk(false)
    }
    completeOnboarding()
    setChecking(false)
    router.push('/console/overview')
  }

  const injectedConnector = connectors.find(c => c.id === 'injected') ?? connectors[0]

  return (
    <div className="theme-shell min-h-screen bg-space flex items-center justify-center p-6" style={{ color: 'var(--text)' }}>
      {/* Background grid */}
      <div className="fixed inset-0 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(128,128,128,0.15) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      {/* Theme toggle — top right */}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 10 }}>
        <ThemeToggle size={32} />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-10">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <Logo440hz height={36} />
          </div>
          <div className="text-sm text-muted mt-1">Decentralized AI Training on 0G Network</div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {['Connect Wallet', 'Profile', 'Select Role', 'Network'].map((l, i) => (
            <div key={i} className="flex-1 flex flex-col gap-1">
              <div className={`h-0.5 rounded-full transition-all ${i <= step ? 'bg-purple' : 'bg-border'}`} />
              <span className={`text-[10px] ${i === step ? 'text-purple-400' : 'text-muted'}`}>{l}</span>
            </div>
          ))}
        </div>

        {/* Step cards */}
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-2xl shadow-black/40">

          {/* Step 0: Connect Wallet */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Connect Your Wallet</h2>
                <p className="text-sm text-muted mt-1">Use your Web3 wallet to authenticate with the 0G network.</p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => connect({ connector: injectedConnector })}
                  disabled={isPending || !injectedConnector}
                  className="w-full flex items-center gap-4 bg-surface-2 hover:bg-border border border-border hover:border-purple/40 rounded-xl p-4 transition-all disabled:opacity-40"
                >
                  <span className="text-2xl">🦊</span>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-white">Browser Wallet</div>
                    <div className="text-xs text-muted">MetaMask, Rabby, or any injected wallet</div>
                  </div>
                  {isPending && <span className="ml-auto text-xs text-muted animate-pulse">Connecting…</span>}
                </button>

                {!injectedConnector && (
                  <p className="text-xs text-amber text-center">
                    No wallet extension detected. Install MetaMask or Rabby.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted">
                <div className="flex-1 h-px bg-border" />
                <span>Connecting adds you to the 0G Galileo Testnet</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <NetworkStat label="Chain ID" value="16602" />
                <NetworkStat label="Network" value="0G Galileo" />
                <NetworkStat label="Currency" value="0G" />
                <NetworkStat label="RPC" value="evmrpc-testnet.0g.ai" />
              </div>
            </div>
          )}

          {/* Step 1: Username */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Choose a Username</h2>
                <p className="text-sm text-muted mt-1">Your identity on the 440hz network. Linked to wallet{' '}
                  <span className="font-mono text-purple-400">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
                </p>
              </div>

              {wrongChain && (
                <div className="flex items-center justify-between bg-amber/10 border border-amber/30 rounded-xl px-4 py-3">
                  <div className="text-xs text-amber">Wrong network detected. Switch to 0G Galileo.</div>
                  <button
                    onClick={() => switchChain({ chainId: zeroGGalileo.id })}
                    className="text-xs bg-amber text-black px-3 py-1 rounded-lg font-semibold ml-3 shrink-0"
                  >
                    Switch
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <input
                  value={inputName}
                  onChange={e => { setInputName(e.target.value); setNameError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleNameNext()}
                  placeholder="e.g. sigma_coder"
                  className="w-full bg-surface-2 border border-border focus:border-purple/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted outline-none transition-colors"
                />
                {nameError && <p className="text-xs text-signal-red">{nameError}</p>}
              </div>

              <div className="flex gap-3">
                <button onClick={() => { disconnect(); setStep(0) }} className="flex-1 py-2.5 rounded-xl border border-border text-muted text-sm hover:text-white hover:border-gray-500 transition-colors">
                  Back
                </button>
                <button onClick={handleNameNext} className="flex-1 py-2.5 rounded-xl bg-purple hover:bg-purple/80 text-white text-sm font-semibold transition-colors">
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Role selection */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Select Your Role</h2>
                <p className="text-sm text-muted mt-1">This sets your default dashboard. You can toggle roles anytime in the header.</p>
              </div>

              <div className="space-y-3">
                {personas.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPersona(p.id)}
                    className={`w-full flex items-start gap-4 p-4 rounded-xl border transition-all text-left ${persona === p.id ? 'border-purple bg-purple/10' : 'border-border hover:border-gray-600 bg-surface-2'}`}
                  >
                    <span className="text-2xl mt-0.5">{p.icon}</span>
                    <div>
                      <div className={`text-sm font-semibold ${persona === p.id ? 'text-purple-400' : 'text-white'}`}>{p.label}</div>
                      <div className="text-xs text-muted mt-0.5">{p.desc}</div>
                    </div>
                    {persona === p.id && (
                      <div className="ml-auto shrink-0 w-5 h-5 rounded-full bg-purple flex items-center justify-center text-[10px]">✓</div>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-xl border border-border text-muted text-sm hover:text-white hover:border-gray-500 transition-colors">
                  Back
                </button>
                <button onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-xl bg-purple hover:bg-purple/80 text-white text-sm font-semibold transition-colors">
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Network provisioning */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Network Provisioning</h2>
                <p className="text-sm text-muted mt-1">Verifying connectivity to the 0G Data Availability and Storage layers.</p>
              </div>

              <div className="space-y-3">
                <ProvisionRow label="0G DA Layer" endpoint="evmrpc-testnet.0g.ai" ok />
                <ProvisionRow label="0G Storage" endpoint="storagescan-galileo.0g.ai" ok />
                <ProvisionRow label="0G Compute" endpoint="0g.ai/compute" ok={false} note="Optional — only needed for Provider role" />
              </div>

              <div className="bg-surface-2 border border-border rounded-xl p-4 text-xs text-muted space-y-1">
                <div className="flex justify-between"><span>Wallet</span><span className="font-mono text-white">{address?.slice(0, 8)}…{address?.slice(-6)}</span></div>
                <div className="flex justify-between"><span>Username</span><span className="text-white">{username || inputName}</span></div>
                <div className="flex justify-between"><span>Role</span><span className="text-purple-400 capitalize">{persona === 'tuner' ? 'LLM Tuner' : persona === 'builder' ? 'Gym Builder' : 'Compute Provider'}</span></div>
                <div className="flex justify-between"><span>Network</span><span className="text-green">0G Galileo Testnet</span></div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 py-2.5 rounded-xl border border-border text-muted text-sm hover:text-white hover:border-gray-500 transition-colors">
                  Back
                </button>
                <button
                  onClick={handleFinish}
                  disabled={checking}
                  className="flex-1 py-2.5 rounded-xl bg-purple hover:bg-purple/80 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {checking ? '⚙ Provisioning…' : '🚀 Enter 440hz'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NetworkStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 border border-border rounded-lg px-3 py-2">
      <div className="text-[10px] text-muted">{label}</div>
      <div className="text-[11px] font-mono text-white truncate">{value}</div>
    </div>
  )
}

function ProvisionRow({ label, endpoint, ok, note }: { label: string; endpoint: string; ok: boolean; note?: string }) {
  return (
    <div className="flex items-start gap-3 bg-surface-2 border border-border rounded-xl p-3">
      <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green' : 'bg-amber'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center">
          <span className="text-sm text-white">{label}</span>
          <span className={`text-[11px] font-medium ${ok ? 'text-green' : 'text-amber'}`}>{ok ? 'Reachable' : 'Optional'}</span>
        </div>
        <div className="text-[11px] font-mono text-muted truncate">{endpoint}</div>
        {note && <div className="text-[10px] text-muted mt-0.5">{note}</div>}
      </div>
    </div>
  )
}
