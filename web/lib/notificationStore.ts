import { create } from 'zustand'

export type NotifType = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
  id: string
  type: NotifType
  message: string
  detail?: string
  createdAt: number
}

interface NotificationStore {
  notifications: Notification[]
  notify: (type: NotifType, message: string, detail?: string) => string
  dismiss: (id: string) => void
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  notify: (type, message, detail) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    set((s) => ({ notifications: [...s.notifications, { id, type, message, detail, createdAt: Date.now() }] }))
    return id
  },
  dismiss: (id) => set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
}))

export const notify = (type: NotifType, message: string, detail?: string) =>
  useNotificationStore.getState().notify(type, message, detail)
