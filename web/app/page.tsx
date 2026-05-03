"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Logo440hz } from "./_components/Logo440hz";
import { ThemeToggle } from "./_components/ThemeToggle";
import { useThemeStore } from "@/lib/themeStore";

const NAV_LINKS = ["Vision", "Gym", "Tuning", "Tech", "Roadmap"];

const SLIDES = [
  {
    label: "The limitations of current LLMs",
    title: "The Data Wall",
    body: "Foundational models have exhausted the internet's high-quality text. Scaling the next generation of AI requires a shift away from static scraping toward synthetic generation and interactive, high-fidelity environments.",
    solution:
      "440hz replaces scraping with structured gym environments — purpose-built simulations that generate task-specific, high-fidelity training signals on-demand, at any scale.",
    image: "/data_wall1.png",
    imageAlt: "Data Wall — fragmented purple pixel art",
  },
  {
    label: "The limitations of current LLMs",
    title: "The Privacy Deadlock",
    body: "The world's most valuable, domain-specific data is locked behind corporate firewalls. Enterprises cannot—and will not—expose proprietary intelligence to centralized LLM providers to train shared models.",
    solution:
      "440hz runs federated LoRA training inside 0G Compute TEEs. Proprietary data never leaves the enterprise boundary — only encrypted weight deltas are aggregated.",
    image: "/privacy1.png",
    imageAlt: "Privacy Deadlock — locked cube pixel art",
  },
  {
    label: "The limitations of current LLMs",
    title: "The Centralization Bottleneck",
    body: "Backhauling terabytes of raw, high-frequency edge data to centralized AWS or GCP servers incurs crippling egress fees and introduces latency that makes real-time tuning impossible.",
    solution:
      "440hz trains at the edge on distributed 0G Compute nodes. No egress, no backhauling — adapters are written directly to 0G Storage from inside the training enclave.",
    image: "/bottleneck.png",
    imageAlt: "Centralization Bottleneck — funnel pixel art",
  },
  {
    label: "The limitations of current LLMs",
    title: "The Stress-test Gap",
    body: "There is no standardized, zero-risk platform to rigorously stress-test autonomous agents. Models either skip practical testing through RL or are forced to learn in production environments, creating catastrophic failure risks.",
    solution:
      "440hz Arenas provide standardized, sandboxed reinforcement environments. Every agent is stress-tested against live reward functions before any production deployment.",
    image: "/stress_test.png",
    imageAlt: "Stress-test Gap — agent void pixel art",
  },
];

function drawContained(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
) {
  const scale = Math.min(W / img.naturalWidth, H / img.naturalHeight) * 0.8;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

export default function LandingPage() {
  const { theme } = useThemeStore();
  const [scrolled, setScrolled] = useState(false);
  const [slide, setSlide] = useState(0);
  const [imageKey, setImageKey] = useState(0);
  const [textPhase, setTextPhase] = useState<"idle" | "out" | "snap" | "in">(
    "idle",
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Canvas pixel-dissolve refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgsRef = useRef<(HTMLImageElement | null)[]>([null, null, null, null]);
  const currentDrawnSlide = useRef(0);
  const nextSlideRef = useRef(0);
  const dissolveAnimRef = useRef<number | null>(null);
  const slideRef = useRef(0);

  useEffect(() => {
    slideRef.current = slide;
  }, [slide]);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Preload all slide images and draw the first one
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    Promise.all(
      SLIDES.map(
        (s, i) =>
          new Promise<void>((resolve) => {
            const img = new window.Image();
            img.onload = () => {
              if (!cancelled) imgsRef.current[i] = img;
              resolve();
            };
            img.onerror = () => resolve();
            img.src = s.image;
          }),
      ),
    ).then(() => {
      if (cancelled) return;
      const img = imgsRef.current[0];
      if (img) drawContained(ctx, img, W, H);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Pixel dissolve on each slide advance
  useEffect(() => {
    if (imageKey === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const fromImg = imgsRef.current[currentDrawnSlide.current];
    const toImg = imgsRef.current[nextSlideRef.current];
    if (!fromImg || !toImg) return;

    if (dissolveAnimRef.current) cancelAnimationFrame(dissolveAnimRef.current);

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const PIXEL_SIZE = 8;
    const DURATION = 1200;

    const srcC = document.createElement("canvas");
    srcC.width = Math.round(W * dpr);
    srcC.height = Math.round(H * dpr);
    const srcCtx = srcC.getContext("2d")!;
    srcCtx.scale(dpr, dpr);
    drawContained(srcCtx, fromImg, W, H);

    const dstC = document.createElement("canvas");
    dstC.width = Math.round(W * dpr);
    dstC.height = Math.round(H * dpr);
    const dstCtx = dstC.getContext("2d")!;
    dstCtx.scale(dpr, dpr);
    drawContained(dstCtx, toImg, W, H);

    const cols = Math.ceil(W / PIXEL_SIZE);
    const rows = Math.ceil(H / PIXEL_SIZE);
    const total = cols * rows;
    const scaledW = Math.round(W * dpr);
    const scaledH = Math.round(H * dpr);
    const srcData = srcCtx.getImageData(0, 0, scaledW, scaledH);
    const dstData = dstCtx.getImageData(0, 0, scaledW, scaledH);

    const indices = new Int32Array(total);
    for (let i = 0; i < total; i++) indices[i] = i;
    for (let i = total - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = indices[i];
      indices[i] = indices[j];
      indices[j] = t;
    }

    const working = new ImageData(
      new Uint8ClampedArray(srcData.data),
      scaledW,
      scaledH,
    );
    let lastReveal = 0;
    let startTime: number | null = null;
    const targetSlide = nextSlideRef.current;
    const psize = Math.round(PIXEL_SIZE * dpr);

    function frame(ts: number) {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / DURATION, 1);
      const revealCount = Math.floor(progress * total);

      for (let i = lastReveal; i < revealCount; i++) {
        const idx = indices[i];
        const col = idx % cols;
        const row = (idx / cols) | 0;
        const px = col * psize;
        const py = row * psize;

        for (let dy = 0; dy < psize; dy++) {
          const y = py + dy;
          if (y >= scaledH) break;
          const yOffset = y * scaledW;
          for (let dx = 0; dx < psize; dx++) {
            const x = px + dx;
            if (x >= scaledW) break;
            const fi = (yOffset + x) * 4;
            working.data[fi] = dstData.data[fi];
            working.data[fi + 1] = dstData.data[fi + 1];
            working.data[fi + 2] = dstData.data[fi + 2];
            working.data[fi + 3] = dstData.data[fi + 3];
          }
        }
      }
      lastReveal = revealCount;
      ctx.putImageData(working, 0, 0);

      if (progress < 1) {
        dissolveAnimRef.current = requestAnimationFrame(frame);
      } else {
        currentDrawnSlide.current = targetSlide;
        dissolveAnimRef.current = null;
      }
    }

    dissolveAnimRef.current = requestAnimationFrame(frame);
    return () => {
      if (dissolveAnimRef.current) {
        cancelAnimationFrame(dissolveAnimRef.current);
        dissolveAnimRef.current = null;
      }
    };
  }, [imageKey]);

  // Scroll animations observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible");
          }
        });
      },
      { threshold: 0.15 },
    );

    document
      .querySelectorAll(".reveal-on-scroll")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  function advance(target?: number) {
    const next =
      target !== undefined ? target : (slideRef.current + 1) % SLIDES.length;
    nextSlideRef.current = next;
    setTextPhase("out");

    setTimeout(() => {
      setSlide(next);
      setTextPhase("snap");
      setImageKey((k) => k + 1);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setTextPhase("in");
          setTimeout(() => setTextPhase("idle"), 480);
        }),
      );
    }, 380);
  }

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => advance(), 5000);
  }

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function goToSlide(i: number) {
    if (i === slide) return;
    advance(i);
    startTimer();
  }

  const isDark = theme === "dark";
  const accentColor = isDark ? "#b75fff" : "#9200E1";
  const current = SLIDES[slide];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-regola)",
      }}
    >
      {/* ── Navbar ──────────────────────────────────────────────── */}
      <nav
        style={{
          position: "sticky",
          top: 0.2,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          padding: "0.1vh 3vw 0.1vh",
          height: "9vh",
          background: scrolled
            ? isDark
              ? "rgba(5,5,5,0.88)"
              : "rgba(240,248,255,0.88)"
            : "transparent",
          backdropFilter: scrolled ? "blur(0.8vw)" : "none",
          //borderBottom: scrolled
          //</div>  ? "0.08vh solid var(--border)"
          //  : "0.08vh solid transparent",
          transition: "background 0.25s, border-color 0.25s",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            textDecoration: "none",
          }}
        >
          <Logo440hz height={32} />
        </Link>

        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            justifyContent: "center",
            gap: "3.5vw",
          }}
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              style={{
                fontFamily: "var(--font-regola)",
                fontWeight: 400,
                fontSize: 15,
                color: "var(--text)",
                textDecoration: "none",
                opacity: 0.75,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.opacity = "1")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.opacity = "0.75")
              }
            >
              {link}
            </a>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexShrink: 0,
            marginLeft: "auto",
          }}
        >
          <ThemeToggle size={36} />
          <Link
            href="/onboarding"
            style={{
              padding: "0.6vh 1.5vw",
              borderRadius: "1.3vh",
              fontFamily: "var(--font-regola)",
              fontWeight: 500,
              fontSize: 14,
              letterSpacing: "0.01em",
              textDecoration: "none",
              border: "none",
              background: isDark ? "#d3d3d3" : "#050505",
              color: isDark ? "#050505" : "#ffffff",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.opacity = "0.8")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.opacity = "1")
            }
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section
        style={{
          minHeight: "calc(100vh - 5vh)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "6vh 6vw 12vh",
          position: "relative",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 400,
            fontSize: 16,
            letterSpacing: "0.06em",
            color: "var(--border)",
            margin: "0 0 .5vh 0",
          }}
        >
          Powered by 0G
        </p>

        <h1
          style={{
            fontFamily: "var(--font-regola)",
            fontWeight: 500,
            fontSize: "clamp(3.5vw, 6.5vw, 6.5vw)",
            lineHeight: 1.02,
            letterSpacing: "-0.025em",
            margin: 0,
            maxWidth: "18ch",
          }}
        >
          <span style={{ color: "var(--text)", display: "block" }}>
            Federated training gyms
          </span>
          <span style={{ color: "var(--text)", display: "block" }}>
            for high-fidelity
          </span>
          <span style={{ color: accentColor, display: "block" }}>
            LLM tuning.
          </span>
        </h1>

        <p
          style={{
            fontFamily: "var(--font-regola)",
            fontWeight: 400,
            fontSize: "2.4vh",
            lineHeight: 1.6,
            color: "var(--text)",
            opacity: 0.55,
            maxWidth: 720,
            marginLeft: "auto",
            marginRight: "auto",
            textAlign: "center",
            position: "absolute",
            bottom: "16vh",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          The missing mile between a Foundational model
          <br />
          and one that&apos;s agentic in nature
        </p>

        {/* Hero Solution Pitch */}
        <div
          className="reveal-on-scroll"
          style={{
            position: "absolute",
            bottom: "4vh",
            left: "6vw",
            right: "6vw",
            display: "flex",
            justifyContent: "center",
            gap: "4vw",
            paddingTop: "2vh",
            borderTop: `1px solid ${accentColor}20`,
          }}
        >
          {[
            { label: "Data Wall", solution: "Synthetic Gyms" },
            { label: "Privacy Deadlock", solution: "Federated TEEs" },
            { label: "Deployment Gap", solution: "0G Orchestration" },
          ].map((p) => (
            <div key={p.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text)",
                  opacity: 0.35,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "0.5vh",
                }}
              >
                {p.label}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-regola)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: accentColor,
                }}
              >
                {p.solution}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Vision ──────────────────────────────────────────────── */}
      <section
        id="vision"
        className="reveal-on-scroll"
        style={{
          height: "100vh",
          background: "var(--bg)",
          color: "var(--text)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
        }}
      >
        {/* Global subheading — centered over left content column */}
        <p
          style={{
            position: "absolute",
            top: "19vh",
            left: 0,
            right: "45%",
            textAlign: "center",
            fontFamily: "var(--font-regola)",
            fontWeight: 400,
            fontSize: "2vh",
            letterSpacing: "0.06em",
            color: "var(--text)",
            opacity: 0.35,
            margin: 0,
            zIndex: 2,
          }}
        >
          The limitations of current LLMs
        </p>

        {/* Slider — centered text content */}
        <div
          style={{
            flex: "0 0 55%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "0 6vw",
            textAlign: "center",
            zIndex: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              opacity: textPhase === "out" || textPhase === "snap" ? 0 : 1,
              transform:
                textPhase === "out"
                  ? "translateX(-4vw)"
                  : textPhase === "snap"
                  ? "translateX(4vw)"
                  : "translateX(0)",
              transition:
                textPhase === "snap"
                  ? "none"
                  : "opacity 0.38s ease, transform 0.38s ease",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-regola)",
                fontWeight: 500,
                fontSize: "clamp(3vw, 5vw, 5.5vw)",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                color: "var(--text)",
                margin: "0 0 2vh 0",
              }}
            >
              {current.title}
            </h2>

            <p
              style={{
                fontFamily: "var(--font-regola)",
                fontWeight: 400,
                fontSize: "clamp(1.2vw, 1vw, 1vw)",
                lineHeight: 1.75,
                color: "var(--text)",
                opacity: 0.52,
                maxWidth: 540,
                margin: "0 auto",
              }}
            >
              {current.body}
            </p>
          </div>
        </div>

        {/* Image — separate container with glitch-dissolve */}
        <div
          style={{
            flex: "0 0 45%",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
            }}
          />
          {/* Bottom fade */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "30%",
              background: "linear-gradient(to top, var(--bg), transparent)",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        </div>

        {/* Diamond dot navigation — centered over left content column */}
        <div
          style={{
            position: "absolute",
            bottom: "12.5vh",
            left: 0,
            right: "45%",
            display: "flex",
            justifyContent: "center",
            gap: "1vw",
            alignItems: "center",
            zIndex: 3,
          }}
        >
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                width: "0.6vw",
                height: "0.6vw",
                transform: "rotate(45deg)",
                borderRadius: "0.15vw",
                border:
                  i === slide
                    ? "none"
                    : `0.12vh solid ${
                        isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)"
                      }`,
                background: i === slide ? "var(--text)" : "transparent",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
                transition: "background 0.3s ease, border-color 0.3s ease",
                scale: i === slide ? "1.2" : "1",
              }}
            />
          ))}
        </div>
      </section>

      {/* ── Vision Holistic Solution ─────────────────────────────── */}
      <section
        className="reveal-on-scroll"
        style={{
          minHeight: "auto",
          background: "var(--bg)",
          color: "var(--text)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "12vh 8vw",
          position: "relative",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.1em",
              color: accentColor,
              margin: "0 0 2vh",
              opacity: 0.8,
            }}
          >
            THE 440HZ SOLUTION
          </p>

          <h2
            style={{
              fontFamily: "var(--font-regola)",
              fontWeight: 500,
              fontSize: "clamp(2.5vw, 4vw, 4vw)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              margin: "0 0 3vh",
              maxWidth: "32ch",
            }}
          >
            A unified platform for{" "}
            <span style={{ color: accentColor }}>
              decentralized, privacy-preserving AI tuning
            </span>{" "}
            at any scale.
          </h2>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "2.5vh" }}
          >
            <div
              style={{
                fontFamily: "var(--font-regola)",
                fontSize: "clamp(14px, 1.8vh, 18px)",
                lineHeight: 1.8,
                opacity: 0.65,
                borderLeft: `3px solid ${accentColor}`,
                paddingLeft: "2vw",
              }}
            >
              <p style={{ margin: "0 0 1.5vh" }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>
                  Synthetic Training:
                </span>{" "}
                Dynamic Gymnasium environments generate task-specific training
                data on-demand instead of relying on internet scraping.
              </p>
              <p style={{ margin: "0 0 1.5vh" }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>
                  Privacy-Preserving Edge Compute:
                </span>{" "}
                Train on proprietary data through secure Docker-in-Docker
                containers on decentralized nodes. Encrypted LoRA deltas are
                aggregated—raw data never leaves.
              </p>
              <p style={{ margin: "0 0 1.5vh" }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>
                  Federated Aggregation:
                </span>{" "}
                Adapters are encrypted, verified via ZK proofs, and merged using
                Flower consensus before writing to 0G Storage.
              </p>
              <p style={{ margin: 0 }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>
                  Pre-deployment Testing:
                </span>{" "}
                Stress-test every agent in sandboxed Arenas with live reward
                functions before production deployment.
              </p>
            </div>

            <div
              style={{
                border: `1px solid ${accentColor}40`,
                padding: "2.5vh 2.5vw",
                background: `${accentColor}05`,
                marginTop: "1vh",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-regola)",
                  fontSize: "clamp(13px, 1.6vh, 16px)",
                  lineHeight: 1.8,
                  opacity: 0.7,
                  margin: 0,
                }}
              >
                <span style={{ color: accentColor, fontWeight: 600 }}>
                  Why this matters now:
                </span>{" "}
                The next generation of AI doesn't live on static datasets—it
                lives in dynamic, adaptive environments. Enterprises need to
                compete without exposing their intelligence. Autonomous agents
                must be tested under pressure before deployment. 440hz makes all
                of this possible on decentralized infrastructure. The future of
                AI tuning is not centralized scrapers on cloud providers—it's
                distributed, private, and on-chain.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Gym ─────────────────────────────────────────────────── */}
      <section
        id="gym"
        className="reveal-on-scroll"
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          color: "var(--text)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "10vh 8vw",
          position: "relative",
        }}
      >
        {/* Subtle grid background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage: `radial-gradient(circle, ${
              isDark ? "rgba(183,95,255,0.06)" : "rgba(146,0,225,0.04)"
            } 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />

        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.1em",
            color: accentColor,
            margin: "0 0 1.5vh",
            opacity: 0.8,
          }}
        >
          /gym
        </p>
        <h2
          style={{
            fontFamily: "var(--font-regola)",
            fontWeight: 500,
            fontSize: "clamp(2.8vw, 4.5vw, 4.5vw)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            margin: "0 0 3vh",
            maxWidth: "22ch",
          }}
        >
          Build the arena.
          <br />
          Set the rules.
          <br />
          <span style={{ color: accentColor }}>Earn from every run.</span>
        </h2>
        <p
          style={{
            fontFamily: "var(--font-regola)",
            fontSize: "clamp(14px, 1.8vh, 18px)",
            opacity: 0.55,
            maxWidth: 560,
            margin: "0 0 7vh",
            lineHeight: 1.7,
          }}
        >
          A 440hz Gym is a Gymnasium environment packaged for on-chain
          distribution. Write your reward function, publish it to 0G Storage,
          and earn royalties every time a tuner trains on your environment.
        </p>

        {/* Three-column flow */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "2vw",
            maxWidth: 900,
          }}
        >
          {[
            {
              num: "01",
              title: "Define Rewards",
              body: "Write reward functions in Python using the full Gymnasium API. Add RLAIF oversight nodes for nuanced scoring.",
            },
            {
              num: "02",
              title: "Build Environment",
              body: "Wire observation spaces, action handlers, and data sources using the visual node graph or Monaco editor.",
            },
            {
              num: "03",
              title: "Publish & Earn",
              body: "Upload to 0G Storage. List on the marketplace. Collect 80% of royalties from every training job that uses your gym.",
            },
          ].map(({ num, title, body }) => (
            <div
              key={num}
              style={{
                border: "1px solid var(--border)",
                padding: "2.5vh 2vw",
                position: "relative",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: accentColor,
                  opacity: 0.6,
                  letterSpacing: "0.08em",
                }}
              >
                {num}
              </span>
              <h3
                style={{
                  fontFamily: "var(--font-regola)",
                  fontWeight: 500,
                  fontSize: "clamp(15px, 1.8vh, 20px)",
                  margin: "1.2vh 0 1vh",
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-regola)",
                  fontSize: "clamp(12px, 1.4vh, 15px)",
                  opacity: 0.5,
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>

        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            opacity: 0.35,
            marginTop: "4vh",
            letterSpacing: "0.04em",
          }}
        >
          5% platform fee · 80% builder royalties · 10% treasury · 5% protocol
        </p>
      </section>

      {/* ── Tuning ───────────────────────────────────────────────── */}
      <section
        id="tuning"
        className="reveal-on-scroll"
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          color: "var(--text)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "10vh 8vw",
          position: "relative",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.1em",
            color: accentColor,
            margin: "0 0 1.5vh",
            opacity: 0.8,
          }}
        >
          /tuning
        </p>
        <h2
          style={{
            fontFamily: "var(--font-regola)",
            fontWeight: 500,
            fontSize: "clamp(2.8vw, 4.5vw, 4.5vw)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            margin: "0 0 2vh",
            maxWidth: "28ch",
          }}
        >
          Federated fine-tuning
          <br />
          <span style={{ color: accentColor }}>
            without trusting a single node.
          </span>
        </h2>
        <p
          style={{
            fontFamily: "var(--font-regola)",
            fontSize: "clamp(14px, 1.8vh, 18px)",
            opacity: 0.55,
            maxWidth: 560,
            margin: "0 0 7vh",
            lineHeight: 1.7,
          }}
        >
          Arenas orchestrate distributed LoRA training on secure edge nodes.
          Encrypted adapters are generated through secure data pipelines with ZK
          verification before federated aggregation.
        </p>

        {/* Pipeline diagram */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            maxWidth: 900,
            marginBottom: "7vh",
            overflowX: "auto",
          }}
        >
          {[
            { label: "Arena", sub: "task.json" },
            { label: "Training", sub: "GRPO / PPO / DPO" },
            { label: "LoRA Adapters", sub: "per-executor delta" },
            { label: "FedAvg Merge", sub: "Flower aggregator" },
            { label: "Deploy", sub: "0G Storage" },
          ].map(({ label, sub }, i, arr) => (
            <div
              key={label}
              style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
            >
              <div
                style={{
                  border: "1px solid var(--border)",
                  padding: "1.6vh 1.6vw",
                  background:
                    i === 0 || i === arr.length - 1
                      ? `${accentColor}10`
                      : "transparent",
                  minWidth: 120,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-regola)",
                    fontSize: "clamp(12px, 1.4vh, 15px)",
                    fontWeight: 500,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    opacity: 0.45,
                    marginTop: 4,
                    letterSpacing: "0.04em",
                  }}
                >
                  {sub}
                </div>
              </div>
              {i < arr.length - 1 && (
                <div
                  style={{
                    width: "2.5vw",
                    height: 1,
                    background: `linear-gradient(90deg, var(--border), ${accentColor}60)`,
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Three callouts */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "2vw",
            maxWidth: 900,
          }}
        >
          {[
            {
              title: "Pick your algorithm",
              body: "GRPO, PPO, or DPO. Configure LoRA rank, learning rate, KL coefficient, and episode budget in the Arena wizard.",
            },
            {
              title: "Secure edge compute via DinD",
              body: "Executors run in isolated Docker-in-Docker containers on decentralized nodes. Encrypted LoRA weights are generated through secure data pipelines with zero exposure to raw data.",
            },
            {
              title: "Federated LoRA aggregation",
              body: "After local training, encrypted adapters are submitted to a Flower aggregator using weighted FedAvg. ZK proofs verify integrity before the merged adapter is written to 0G Storage.",
            },
          ].map(({ title, body }) => (
            <div
              key={title}
              style={{
                borderTop: `2px solid ${accentColor}40`,
                paddingTop: "2vh",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-regola)",
                  fontWeight: 500,
                  fontSize: "clamp(14px, 1.6vh, 18px)",
                  margin: "0 0 1vh",
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-regola)",
                  fontSize: "clamp(12px, 1.4vh, 15px)",
                  opacity: 0.5,
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tech ─────────────────────────────────────────────────── */}
      <section
        id="tech"
        className="reveal-on-scroll"
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          color: "var(--text)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "10vh 8vw",
          position: "relative",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.1em",
            color: accentColor,
            margin: "0 0 1.5vh",
            opacity: 0.8,
          }}
        >
          /tech
        </p>
        <h2
          style={{
            fontFamily: "var(--font-regola)",
            fontWeight: 500,
            fontSize: "clamp(2.8vw, 4.5vw, 4.5vw)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            margin: "0 0 2vh",
          }}
        >
          Powered by <span style={{ color: accentColor }}>0G.</span>
        </h2>
        <p
          style={{
            fontFamily: "var(--font-regola)",
            fontSize: "clamp(14px, 1.8vh, 18px)",
            opacity: 0.55,
            maxWidth: 500,
            margin: "0 0 7vh",
            lineHeight: 1.7,
          }}
        >
          Every layer of the stack is built on 0G&apos;s decentralized AI
          infrastructure.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "1.5vw",
            maxWidth: 900,
            marginBottom: "5vh",
          }}
        >
          {[
            {
              name: "0G Storage",
              tag: "Data layer",
              desc: "Gym bundles, LoRA adapters, and training checkpoints are stored as content-addressed blobs. Root hashes are the universal identifier.",
              detail: null,
            },
            {
              name: "0G Compute",
              tag: "Execution layer",
              desc: "A customized fork of 0G Compute optimized for RL and heavy AI fine-tuning. Training jobs run inside TEE-isolated executor containers on decentralized edge nodes. Raw proprietary data never leaves the enclave.",
              detail: null,
            },
            {
              name: "ZK Verification",
              tag: "Integrity layer",
              desc: "Computational proofs are verified using ZK technology to guarantee training integrity and provider accountability. The chain verifies proofs before settlement and payment.",
              detail: null,
            },
            {
              name: "Smart Contracts",
              tag: "0G Galileo · chainId 16602",
              desc: "GymMarketplace handles listings, purchases, and royalty distribution. TrainingEscrow holds compute payment in escrow per job.",
              detail: (
                <div
                  style={{
                    marginTop: "1.5vh",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {[
                    {
                      label: "GymMarketplace",
                      addr: "0xb3Df63Ac5Ec5648d2E764a7C579148F29858E99D",
                    },
                    {
                      label: "TrainingEscrow",
                      addr: "0x558298297E714312D5670dBe4dbc15E1D240a811",
                    },
                  ].map(({ label, addr }) => (
                    <a
                      key={label}
                      href={`https://chainscan-galileo.0g.ai/address/${addr}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: accentColor,
                        opacity: 0.7,
                        textDecoration: "none",
                        letterSpacing: "0.03em",
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.opacity = "1")}
                      onMouseOut={(e) =>
                        (e.currentTarget.style.opacity = "0.7")
                      }
                    >
                      {label} ↗
                    </a>
                  ))}
                </div>
              ),
            },
          ].map(({ name, tag, desc, detail }) => (
            <div
              key={name}
              style={{
                border: "1px solid var(--border)",
                padding: "2.5vh 2vw",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "1.2vh",
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-regola)",
                    fontWeight: 500,
                    fontSize: "clamp(15px, 1.8vh, 20px)",
                    margin: 0,
                  }}
                >
                  {name}
                </h3>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: accentColor,
                    opacity: 0.55,
                    letterSpacing: "0.07em",
                    paddingTop: 3,
                  }}
                >
                  {tag}
                </span>
              </div>
              <p
                style={{
                  fontFamily: "var(--font-regola)",
                  fontSize: "clamp(12px, 1.4vh, 15px)",
                  opacity: 0.5,
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {desc}
              </p>
              {detail}
            </div>
          ))}
        </div>

        {/* ENS identity layer note */}
        <div
          style={{
            border: `1px solid ${accentColor}30`,
            padding: "2vh 2vw",
            maxWidth: 900,
            background: `${accentColor}05`,
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-regola)",
              fontWeight: 500,
              fontSize: "clamp(14px, 1.6vh, 18px)",
              margin: "0 0 0.8vh",
              color: accentColor,
            }}
          >
            440hz.eth — on-chain identity
          </h3>
          <p
            style={{
              fontFamily: "var(--font-regola)",
              fontSize: "clamp(12px, 1.4vh, 15px)",
              opacity: 0.55,
              margin: 0,
              lineHeight: 1.65,
            }}
          >
            Every user, gym, model, and weight set gets a human-readable subname
            under{" "}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
              440hz.eth
            </span>
            . Issued on Base Sepolia via the Durin L2 registry — e.g.{" "}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
              sigma-coder.440hz.eth
            </span>
            ,{" "}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
              sql-v3-gym.440hz.eth
            </span>
            .
          </p>
        </div>
      </section>

      {/* ── Roadmap ──────────────────────────────────────────────── */}
      <section
        id="roadmap"
        className="reveal-on-scroll"
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          color: "var(--text)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "10vh 8vw",
          position: "relative",
        }}
      >
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.1em",
              color: accentColor,
              margin: "0 0 1.5vh",
              opacity: 0.8,
            }}
          >
            /roadmap
          </p>
          <h2
            style={{
              fontFamily: "var(--font-regola)",
              fontWeight: 500,
              fontSize: "clamp(2.8vw, 4.5vw, 4.5vw)",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              margin: "0 0 1.5vh",
            }}
          >
            What&apos;s <span style={{ color: accentColor }}>coming next.</span>
          </h2>
          <p
            style={{
              fontFamily: "var(--font-regola)",
              fontSize: "clamp(14px, 1.8vh, 18px)",
              opacity: 0.55,
              maxWidth: 600,
              margin: "0 0 6vh",
              lineHeight: 1.7,
            }}
          >
            440hz is evolving rapidly. Here's what we're building to expand the
            platform.
          </p>

          
          {/* Vision features */}
          <div>
            <h3
              style={{
                fontFamily: "var(--font-regola)",
                fontWeight: 600,
                fontSize: "clamp(16px, 1.8vh, 20px)",
                margin: "0 0 2.5vh",
                color: accentColor,
              }}
            >
               
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "2vw",
              }}
            >
              {[
                {
                  title: "Multi-Agent Training (PettingZoo)",
                  desc: "Build complex multi-agent environments with competitive or cooperative dynamics. Agents train simultaneously with federated weight aggregation.",
                },
                {
                  title: "3D RL Environments",
                  desc: "Integrate MuJoCo and PyBullet for physics-based training. Robotic manipulation, locomotion, and spatial reasoning at scale.",
                },
                {
                  title: "Advanced Environment Templates",
                  desc: "Pre-built gym templates for common domains: code generation, SQL optimization, API orchestration, customer support automation.",
                },
                {
                  title: "In-Gym AI Reasoning",
                  desc: "Chain-of-thought and multi-step reasoning inside environments. Models learn complex workflows, not isolated tasks.",
                },
              ].map(({ title, desc }) => (
                <div
                  key={title}
                  style={{
                    border: `1px solid var(--border)`,
                    padding: "2vh 2vw",
                    background: "transparent",
                  }}
                >
                  <h4
                    style={{
                      fontFamily: "var(--font-regola)",
                      fontWeight: 500,
                      fontSize: "clamp(14px, 1.6vh, 18px)",
                      margin: "0 0 1vh",
                      color: "var(--text)",
                    }}
                  >
                    {title}
                  </h4>
                  <p
                    style={{
                      fontFamily: "var(--font-regola)",
                      fontSize: "clamp(12px, 1.4vh, 15px)",
                      opacity: 0.55,
                      margin: 0,
                      lineHeight: 1.6,
                    }}
                  >
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div
            style={{
              marginTop: "6vh",
              padding: "3vh 3vw",
              border: `2px solid ${accentColor}40`,
              background: `${accentColor}08`,
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-regola)",
                fontSize: "clamp(13px, 1.6vh, 16px)",
                lineHeight: 1.8,
                opacity: 0.7,
                margin: 0,
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--text)" }}>
                Start building today.
              </span>{" "}
              The 440hz console is open. Create your first gym, submit a
              training job, or spin up a provider node to earn rewards.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
