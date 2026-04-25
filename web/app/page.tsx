'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Logo440hz } from './_components/Logo440hz'
import { ThemeToggle } from './_components/ThemeToggle'
import { useThemeStore } from '@/lib/themeStore'

const NAV_LINKS = ['Vision', 'Gym', 'Tuning', 'Tech', 'Docs']

const SLIDES = [
  {
    label: 'The limitations of current LLMs',
    title: 'The Data Wall',
    body: "Foundational models have exhausted the internet's high-quality text. Scaling the next generation of AI requires a shift away from static scraping toward synthetic generation and interactive, high-fidelity environments.",
    image: '/data_wall1.png',
    imageAlt: 'Data Wall — fragmented purple pixel art',
  },
  {
    label: 'The limitations of current LLMs',
    title: 'The Privacy Deadlock',
    body: "The world's most valuable, domain-specific data is locked behind corporate firewalls. Enterprises cannot—and will not—expose proprietary intelligence to centralized LLM providers to train shared models.",
    image: '/privacy1.png',
    imageAlt: 'Privacy Deadlock — locked cube pixel art',
  },
  {
    label: 'The limitations of current LLMs',
    title: 'The Centralization Bottleneck',
    body: 'Backhauling terabytes of raw, high-frequency edge data to centralized AWS or GCP servers incurs crippling egress fees and introduces latency that makes real-time tuning impossible.',
    image: '/bottleneck.png',
    imageAlt: 'Centralization Bottleneck — funnel pixel art',
  },
  {
    label: 'The limitations of current LLMs',
    title: 'The Stress-test Gap',
    body: 'There is no standardized, zero-risk platform to rigorously stress-test autonomous agents. Models either skip practical testing through RL or are forced to learn in production environments, creating catastrophic failure risks.',
    image: '/stress_test.png',
    imageAlt: 'Stress-test Gap — agent void pixel art',
  },
]

function drawContained(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
) {
  const scale = Math.min(W / img.naturalWidth, H / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

export default function LandingPage() {
  const { theme } = useThemeStore()
  const [scrolled, setScrolled] = useState(false)
  const [slide, setSlide] = useState(0)
  const [imageKey, setImageKey] = useState(0)
  const [textPhase, setTextPhase] = useState<'idle' | 'out' | 'snap' | 'in'>('idle')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Canvas pixel-dissolve refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgsRef = useRef<(HTMLImageElement | null)[]>([null, null, null, null])
  const currentDrawnSlide = useRef(0)
  const nextSlideRef = useRef(0)
  const dissolveAnimRef = useRef<number | null>(null)
  const slideRef = useRef(0)

  useEffect(() => { slideRef.current = slide }, [slide])

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // Preload all slide images and draw the first one
  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    canvas.width = Math.round(rect.width)
    canvas.height = Math.round(rect.height)

    const W = canvas.width
    const H = canvas.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    Promise.all(
      SLIDES.map((s, i) => new Promise<void>(resolve => {
        const img = new window.Image()
        img.onload = () => { if (!cancelled) imgsRef.current[i] = img; resolve() }
        img.onerror = () => resolve()
        img.src = s.image
      }))
    ).then(() => {
      if (cancelled) return
      const img = imgsRef.current[0]
      if (img) drawContained(ctx, img, W, H)
    })

    return () => { cancelled = true }
  }, [])

  // Pixel dissolve on each slide advance
  useEffect(() => {
    if (imageKey === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const fromImg = imgsRef.current[currentDrawnSlide.current]
    const toImg = imgsRef.current[nextSlideRef.current]
    if (!fromImg || !toImg) return

    if (dissolveAnimRef.current) cancelAnimationFrame(dissolveAnimRef.current)

    const W = canvas.width
    const H = canvas.height
    const PIXEL_SIZE = 5
    const DURATION = 1400

    const srcC = document.createElement('canvas')
    srcC.width = W; srcC.height = H
    const srcCtx = srcC.getContext('2d')!
    drawContained(srcCtx, fromImg, W, H)

    const dstC = document.createElement('canvas')
    dstC.width = W; dstC.height = H
    const dstCtx = dstC.getContext('2d')!
    drawContained(dstCtx, toImg, W, H)

    const cols = Math.ceil(W / PIXEL_SIZE)
    const rows = Math.ceil(H / PIXEL_SIZE)
    const total = cols * rows
    const srcData = srcCtx.getImageData(0, 0, W, H)
    const dstData = dstCtx.getImageData(0, 0, W, H)

    const indices = new Int32Array(total)
    for (let i = 0; i < total; i++) indices[i] = i
    for (let i = total - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      const t = indices[i]; indices[i] = indices[j]; indices[j] = t
    }

    const working = new ImageData(new Uint8ClampedArray(srcData.data), W, H)
    let lastReveal = 0
    let startTime: number | null = null
    const targetSlide = nextSlideRef.current

    function frame(ts: number) {
      if (!startTime) startTime = ts
      const progress = Math.min((ts - startTime) / DURATION, 1)
      const revealCount = Math.floor(progress * total)

      for (let i = lastReveal; i < revealCount; i++) {
        const idx = indices[i]
        const col = idx % cols
        const row = (idx / cols) | 0
        const px = col * PIXEL_SIZE
        const py = row * PIXEL_SIZE
        for (let dy = 0; dy < PIXEL_SIZE; dy++) {
          for (let dx = 0; dx < PIXEL_SIZE; dx++) {
            const x = px + dx, y = py + dy
            if (x >= W || y >= H) continue
            const fi = (y * W + x) * 4
            working.data[fi]     = dstData.data[fi]
            working.data[fi + 1] = dstData.data[fi + 1]
            working.data[fi + 2] = dstData.data[fi + 2]
            working.data[fi + 3] = dstData.data[fi + 3]
          }
        }
      }
      lastReveal = revealCount
      ctx.putImageData(working, 0, 0)

      if (progress < 1) {
        dissolveAnimRef.current = requestAnimationFrame(frame)
      } else {
        currentDrawnSlide.current = targetSlide
        dissolveAnimRef.current = null
      }
    }

    dissolveAnimRef.current = requestAnimationFrame(frame)
    return () => {
      if (dissolveAnimRef.current) { cancelAnimationFrame(dissolveAnimRef.current); dissolveAnimRef.current = null }
    }
  }, [imageKey])

  function advance(target?: number) {
    const next = target !== undefined ? target : (slideRef.current + 1) % SLIDES.length
    nextSlideRef.current = next
    setTextPhase('out')
    setImageKey(k => k + 1)

    setTimeout(() => {
      setSlide(next)
      setTextPhase('snap')
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setTextPhase('in')
        setTimeout(() => setTextPhase('idle'), 480)
      }))
    }, 380)
  }

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => advance(), 5000)
  }

  useEffect(() => {
    startTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function goToSlide(i: number) {
    if (i === slide) return
    advance(i)
    startTimer()
  }

  const isDark = theme === 'dark'
  const accentColor = isDark ? '#b75fff' : '#9200E1'
  const current = SLIDES[slide]

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
        <Link href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0, textDecoration: 'none' }}>
          <Logo440hz height={32} />
        </Link>

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

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <ThemeToggle size={36} />
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

      {/* ── Vision ──────────────────────────────────────────────── */}
      <section
        id="vision"
        style={{
          height: '100vh',
          background: 'var(--bg)',
          color: 'var(--text)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {/* Global subheading — centered over left content column */}
        <p
          style={{
            position: 'absolute',
            top: 52, left: 0, right: '45%',
            textAlign: 'center',
            fontFamily: 'var(--font-regola)', fontWeight: 400,
            fontSize: 17, letterSpacing: '0.06em',
            color: 'var(--text)', opacity: 0.35,
            margin: 0, zIndex: 2,
          }}
        >
          The limitations of current LLMs
        </p>

        {/* Slider — centered text content */}
        <div
          style={{
            flex: '0 0 55%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0 80px',
            textAlign: 'center',
            zIndex: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              opacity: textPhase === 'out' || textPhase === 'snap' ? 0 : 1,
              transform:
                textPhase === 'out'  ? 'translateX(-56px)' :
                textPhase === 'snap' ? 'translateX(56px)'  : 'translateX(0)',
              transition: textPhase === 'snap' ? 'none' : 'opacity 0.38s ease, transform 0.38s ease',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-regola)', fontWeight: 500,
                fontSize: 'clamp(44px, 5vw, 76px)',
                lineHeight: 1.05, letterSpacing: '-0.02em',
                color: 'var(--text)',
                margin: '0 0 28px 0',
              }}
            >
              {current.title}
            </h2>

            <p
              style={{
                fontFamily: 'var(--font-regola)', fontWeight: 400,
                fontSize: 'clamp(16px, 1.35vw, 20px)', lineHeight: 1.75,
                color: 'var(--text)', opacity: 0.52,
                maxWidth: 440, margin: '0 auto',
              }}
            >
              {current.body}
            </p>
          </div>
        </div>

        {/* Image — separate container with glitch-dissolve */}
        <div
          style={{
            flex: '0 0 45%',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          />
          {/* Bottom fade */}
          <div
            style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: '30%',
              background: 'linear-gradient(to top, var(--bg), transparent)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        </div>

        {/* Diamond dot navigation — centered over left content column */}
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            left: 0, right: '45%',
            display: 'flex', justifyContent: 'center',
            gap: 14, alignItems: 'center',
            zIndex: 3,
          }}
        >
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                width: 9, height: 9,
                transform: 'rotate(45deg)',
                borderRadius: 2,
                border: i === slide ? 'none' : `1.5px solid ${isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)'}`,
                background: i === slide ? 'var(--text)' : 'transparent',
                cursor: 'pointer', padding: 0, flexShrink: 0,
                transition: 'background 0.3s ease, border-color 0.3s ease',
                scale: i === slide ? '1.2' : '1',
              }}
            />
          ))}
        </div>
      </section>

      {/* Anchor targets for remaining nav sections */}
      {(['gym', 'tuning', 'tech', 'docs'] as const).map(l => (
        <div key={l} id={l} style={{ height: 0 }} />
      ))}
    </div>
  )
}
