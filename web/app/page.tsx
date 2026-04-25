'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Logo440hz } from './_components/Logo440hz'
import { ThemeToggle } from './_components/ThemeToggle'
import { useThemeStore } from '@/lib/themeStore'

const NAV_LINKS = ['Vision', 'Gym', 'Tuning', 'Tech', 'Docs']

export default function LandingPage() {
  const { theme } = useThemeStore()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const isDark = theme === 'dark'
  const accentColor = isDark ? '#b75fff' : '#9200E1'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'var(--font-regola)',
      }}
    >
      {/* ── Navbar ──────────────────────────────────────────────── */}
      <nav
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          display: 'flex', alignItems: 'center',
          padding: '0 48px', height: 72,
          background: scrolled
            ? (isDark ? 'rgba(5,5,5,0.88)' : 'rgba(240,248,255,0.88)')
            : 'transparent',
          backdropFilter: scrolled ? 'blur(16px)' : 'none',
          borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
          transition: 'background 0.25s, border-color 0.25s',
        }}
      >
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0, textDecoration: 'none' }}>
          <Logo440hz height={32} />
        </Link>

        {/* Nav links — centred */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 44 }}>
          {NAV_LINKS.map(link => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              style={{
                fontFamily: 'var(--font-regola)',
                fontWeight: 400, fontSize: 15,
                color: 'var(--text)', textDecoration: 'none',
                opacity: 0.75, transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '0.75')}
            >
              {link}
            </a>
          ))}
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <ThemeToggle size={36} />

          {/* Get Started */}
          <Link
            href="/onboarding"
            style={{
              padding: '8px 22px', borderRadius: 8,
              fontFamily: 'var(--font-regola)',
              fontWeight: 500, fontSize: 14,
              letterSpacing: '0.01em', textDecoration: 'none', border: 'none',
              background: isDark ? '#d3d3d3' : '#050505',
              color: isDark ? '#050505' : '#ffffff',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '0.8')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section
        style={{
          minHeight: 'calc(100vh - 72px)',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px 80px 160px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-regola)', fontWeight: 400,
            fontSize: 20, letterSpacing: '0.06em',
            color: 'var(--text)', opacity: 0.45,
            margin: '0 0 32px 0',
          }}
        >
          &nbsp; Powered by 0G
        </p>

        <h1
          style={{
            fontFamily: 'var(--font-regola)', fontWeight: 500,
            fontSize: 'clamp(52px, 7.5vw, 108px)',
            lineHeight: 1.02, letterSpacing: '-0.025em',
            margin: 0, maxWidth: '18ch',
          }}
        >
          <span style={{ color: 'var(--text)', display: 'block' }}>Federated training gyms</span>
          <span style={{ color: 'var(--text)', display: 'block' }}>for high-fidelity</span>
          <span style={{ color: accentColor, display: 'block' }}>LLM tuning.</span>
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-regola)', fontWeight: 400,
            fontSize: 'clamp(15px, 1.5vw, 19px)', lineHeight: 1.6,
            color: 'var(--text)', opacity: 0.55,
            marginTop: 80, maxWidth: 520,
            marginLeft: 'auto', marginRight: 'auto',
            textAlign: 'center',
          }}
        >
          The missing mile between a Foundational model
          <br />and one that's agentic in nature
        </p>
      </section>

      {/* Hidden anchor targets */}
      {NAV_LINKS.map(l => (
        <div key={l} id={l.toLowerCase()} style={{ height: 0 }} />
      ))}
    </div>
  )
}
