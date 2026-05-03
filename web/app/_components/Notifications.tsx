'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNotificationStore, type Notification, type NotifType } from '@/lib/notificationStore'

const AUTO_DISMISS_MS = 10_000

const TYPE_STYLES: Record<NotifType, { bg: string; border: string; icon: string; bar: string }> = {
  success: {
    bg:     'oklch(0.78 0.14 150 / 0.12)',
    border: 'oklch(0.78 0.14 150 / 0.35)',
    icon:   '✓',
    bar:    'var(--ok)',
  },
  error: {
    bg:     'oklch(0.68 0.21 25 / 0.12)',
    border: 'oklch(0.68 0.21 25 / 0.35)',
    icon:   '✕',
    bar:    'var(--danger)',
  },
  warning: {
    bg:     'oklch(0.80 0.14 75 / 0.12)',
    border: 'oklch(0.80 0.14 75 / 0.35)',
    icon:   '⚠',
    bar:    'var(--warn)',
  },
  info: {
    bg:     'oklch(0.66 0.19 305 / 0.12)',
    border: 'oklch(0.66 0.19 305 / 0.35)',
    icon:   'ℹ',
    bar:    'var(--accent)',
  },
}

function Toast({ notif, onDismiss }: { notif: Notification; onDismiss: () => void }) {
  const s = TYPE_STYLES[notif.type]
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = progressRef.current
    if (!el) return
    el.style.transition = 'none'
    el.style.width = '100%'
    requestAnimationFrame(() => {
      el.style.transition = `width ${AUTO_DISMISS_MS}ms linear`
      el.style.width = '0%'
    })

    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      style={{
        position: 'relative',
        background: s.bg,
        border: `1px solid ${s.border}`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: 12,
        padding: '10px 14px 12px',
        minWidth: 280,
        maxWidth: 440,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        animation: 'notif-in 0.22s cubic-bezier(0.34,1.56,0.64,1) both',
      }}
    >
      {/* Progress bar */}
      <div ref={progressRef} style={{
        position: 'absolute',
        bottom: 0, left: 0, height: 2,
        background: s.bar,
        width: '100%',
        borderRadius: '0 0 12px 12px',
      }} />

      {/* Icon */}
      <span style={{ fontSize: 13, color: s.bar, flexShrink: 0, marginTop: 1, fontWeight: 700 }}>
        {s.icon}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--text)', lineHeight: 1.4 }}>
          {notif.message}
        </p>
        {notif.detail && (
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4, wordBreak: 'break-all' }}>
            {notif.detail}
          </p>
        )}
      </div>

      {/* Close */}
      <button
        onClick={onDismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-3)', fontSize: 15, lineHeight: 1,
          padding: 2, flexShrink: 0, marginTop: -1,
          transition: 'color 0.1s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)' }}
      >
        ×
      </button>
    </div>
  )
}

export function Notifications() {
  const { notifications, dismiss } = useNotificationStore()

  if (typeof document === 'undefined' || notifications.length === 0) return null

  return createPortal(
    <>
      <style>{`
        @keyframes notif-in {
          from { opacity: 0; transform: translateY(-14px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)     scale(1); }
        }
      `}</style>
      <div style={{
        position: 'fixed',
        top: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'center',
        pointerEvents: 'none',
      }}>
        {notifications.map((n) => (
          <div key={n.id} style={{ pointerEvents: 'auto' }}>
            <Toast notif={n} onDismiss={() => dismiss(n.id)} />
          </div>
        ))}
      </div>
    </>,
    document.body
  )
}
