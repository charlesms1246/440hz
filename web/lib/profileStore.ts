import { create } from 'zustand'

export type Persona = 'tuner' | 'builder' | 'provider'

export type FullProfile = {
  username: string
  ensName: string
  persona: Persona
  onboardingComplete: boolean
  profilePicture: string
  storageSequence: number
}

interface ProfileState extends FullProfile {
  hydrate: (address: string) => Promise<void>
  save: (address: string, patch: Partial<FullProfile>) => Promise<FullProfile & { rootHash: string }>
  setPersona: (persona: Persona) => void
  setEnsName: (ensName: string) => void
}

export const useProfileStore = create<ProfileState>()((set) => ({
  username: '',
  ensName: '',
  persona: 'tuner',
  onboardingComplete: false,
  profilePicture: '',
  storageSequence: 0,

  async hydrate(address: string) {
    const res = await fetch(`/api/profile?address=${address}`)
    if (!res.ok) return
    const index: { ensName: string; storageSequence: number; rootHash?: string } | null = await res.json()
    if (!index) return

    set({
      ensName: index.ensName,
      storageSequence: index.storageSequence,
      onboardingComplete: index.storageSequence > 0,
    })

    // Lazily load full bundle (username, persona, profilePicture) from 0G Storage
    if (index.rootHash) {
      fetch(`/api/profile/bundle?hash=${index.rootHash}`)
        .then(r => (r.ok ? r.json() : null))
        .then((bundle: FullProfile | null) => { if (bundle) set(bundle) })
        .catch(() => {})
    }
  },

  async save(address: string, patch: Partial<FullProfile>) {
    set(patch as Partial<ProfileState>)
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, ...patch }),
    })
    const saved: FullProfile & { rootHash: string } = await res.json()
    set(saved)
    return saved
  },

  setPersona: (persona) => set({ persona }),
  setEnsName: (ensName) => set({ ensName }),
}))
