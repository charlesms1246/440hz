import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type GymEntry = {
  rootHash: string
  name: string
  savedAt: string
}

interface GymStore {
  savedGyms: GymEntry[]
  currentGymHash: string | null
  addSavedGym: (entry: GymEntry) => void
  setCurrentGymHash: (hash: string | null) => void
  removeSavedGym: (rootHash: string) => void
}

export const useGymStore = create<GymStore>()(
  persist(
    (set) => ({
      savedGyms: [],
      currentGymHash: null,
      addSavedGym: (entry) =>
        set((s) => ({
          savedGyms: [
            entry,
            ...s.savedGyms.filter((g) => g.rootHash !== entry.rootHash),
          ].slice(0, 50),
        })),
      setCurrentGymHash: (hash) => set({ currentGymHash: hash }),
      removeSavedGym: (rootHash) =>
        set((s) => ({
          savedGyms: s.savedGyms.filter((g) => g.rootHash !== rootHash),
          currentGymHash: s.currentGymHash === rootHash ? null : s.currentGymHash,
        })),
    }),
    { name: '440hz-gyms' }
  )
)
