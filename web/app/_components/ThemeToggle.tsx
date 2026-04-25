'use client'

import { useThemeStore } from '@/lib/themeStore'

export function ThemeToggle({ size = 32, className }: { size?: number; className?: string }) {
  const { theme, toggle } = useThemeStore()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className={className}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'transparent', border: 'none',
        color: 'var(--highlight)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, flexShrink: 0, transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.7')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}
