import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Persona = 'tuner' | 'builder' | 'provider'

interface ProfileState {
  username: string
  ensName: string
  persona: Persona
  onboardingComplete: boolean
  setUsername: (username: string) => void
  setEnsName: (ensName: string) => void
  setPersona: (persona: Persona) => void
  completeOnboarding: () => void
  reset: () => void
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      username: '',
      ensName: '',
      persona: 'tuner',
      onboardingComplete: false,
      setUsername: (username) => set({ username }),
      setEnsName: (ensName) => set({ ensName }),
      setPersona: (persona) => set({ persona }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      reset: () => set({ username: '', ensName: '', persona: 'tuner', onboardingComplete: false }),
    }),
    { name: '440hz-profile' }
  )
)
