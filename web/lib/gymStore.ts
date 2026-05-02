import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type VersionEntry = {
  hash: string       // 0G rootHash of the GymBundle at this version
  timestamp: string  // ISO 8601
  message: string    // user-supplied commit note, '' if blank
}

export type VersionManifest = {
  schemaVersion: '1'
  gymName: string
  versions: VersionEntry[]  // oldest first
  current: string           // rootHash of the active version
}

export type GymEntry = {
  rootHash: string
  name: string
  savedAt: string
  contentHash?: string      // SHA-256 of wire bytes — change detection only
  versions?: VersionEntry[]
  manifestHash?: string     // 0G rootHash of last uploaded VersionManifest
  ensLabel?: string         // e.g. 'my-gym' (sans -gym suffix); set on publish
}

interface GymStore {
  savedGyms: GymEntry[]
  currentGymHash: string | null
  addSavedGym: (entry: GymEntry) => void
  setCurrentGymHash: (hash: string | null) => void
  removeSavedGym: (rootHash: string) => void
  updateGymEntry: (rootHash: string, patch: Partial<GymEntry>) => void
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
      updateGymEntry: (rootHash, patch) =>
        set((s) => ({
          savedGyms: s.savedGyms.map((g) =>
            g.rootHash === rootHash ? { ...g, ...patch } : g
          ),
        })),
    }),
    { name: '440hz-gyms' }
  )
)
