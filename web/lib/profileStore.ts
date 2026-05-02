import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Persona = 'tuner' | 'builder' | 'provider'

interface ProfileState {
  username: string
  ensName: string
  persona: Persona
  onboardingComplete: boolean
  walletAddress: string
  profilePicture: string
  profilePictureHash: string
  setUsername: (username: string) => void
  setEnsName: (ensName: string) => void
  setPersona: (persona: Persona) => void
  completeOnboarding: () => void
  setWalletAddress: (address: string) => void
  setProfilePicture: (picture: string) => void
  setProfilePictureHash: (hash: string) => void
  reset: () => void
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      username: '',
      ensName: '',
      persona: 'tuner',
      onboardingComplete: false,
      walletAddress: '',
      profilePicture: '',
      profilePictureHash: '',
      setUsername: (username) => set({ username }),
      setEnsName: (ensName) => set({ ensName }),
      setPersona: (persona) => set({ persona }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      setWalletAddress: (walletAddress) => set({ walletAddress }),
      setProfilePicture: (profilePicture) => set({ profilePicture }),
      setProfilePictureHash: (profilePictureHash) => set({ profilePictureHash }),
      reset: () => set({ username: '', ensName: '', persona: 'tuner', onboardingComplete: false, walletAddress: '', profilePicture: '', profilePictureHash: '' }),
    }),
    { name: '440hz-profile' }
  )
)
