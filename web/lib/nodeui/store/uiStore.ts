import { create } from 'zustand'

interface UIStore {
  exportDialogOpen: boolean
  exportErrors: { severity: 'error' | 'warning'; message: string }[]
  setExportDialog: (open: boolean, errors?: { severity: 'error' | 'warning'; message: string }[]) => void
}

export const useUIStore = create<UIStore>()((set) => ({
  exportDialogOpen: false,
  exportErrors: [],
  setExportDialog: (open, errors = []) => set({ exportDialogOpen: open, exportErrors: errors }),
}))
