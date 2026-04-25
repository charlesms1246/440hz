export function StressTestArt() {
  const P = '#b75fff'
  const PD = 'rgba(183,95,255,0.35)'
  const PF = 'rgba(183,95,255,0.10)'
  const RED = '#ef4444'

  // Pixel grid positions for the "agent" figure (left side)
  const agentPixels = [
    // head
    [2, 0], [3, 0], [4, 0], [5, 0],
    [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
    [1, 2], [6, 2],
    [2, 2], [3, 2], [4, 2], [5, 2],
    // eyes
    [2, 2], [5, 2],
    // torso
    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3],
    [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4],
    [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5],
    [1, 6], [6, 6],
    // legs
    [2, 7], [3, 7], [4, 7], [5, 7],
    [2, 8], [5, 8],
    [2, 9], [5, 9],
    [1, 10], [2, 10], [4, 10], [5, 10],
  ]

  const CELL = 16
  const agentX = 40
  const agentY = 180

  // Gap zone
  const gapX1 = 210
  const gapX2 = 310
  const gapY = 400

  // Right side disconnected fragments
  const fragments = [
    [316, 280], [336, 300], [356, 260], [320, 320],
    [340, 240], [360, 310], [330, 350], [350, 280],
  ]

  return (
    <svg viewBox="0 0 384 560" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>

      {/* Ground plane — left side (reachable) */}
      <rect x={20} y={gapY} width={gapX1 - 20} height={8} fill={PD} rx="1" />
      {[0, 1, 2, 3, 4, 5, 6].map(i => (
        <rect key={i} x={24 + i * 26} y={gapY + 10} width={18} height={4} fill={PF} rx="1" />
      ))}

      {/* Ground plane — right side (unreachable, faded) */}
      <rect x={gapX2} y={gapY} width={364 - gapX2} height={8} fill="rgba(183,95,255,0.15)" rx="1" />
      {[0, 1, 2].map(i => (
        <rect key={i} x={gapX2 + 4 + i * 26} y={gapY + 10} width={18} height={4} fill="rgba(183,95,255,0.06)" rx="1" />
      ))}

      {/* Void / gap */}
      <rect x={gapX1} y={gapY} width={gapX2 - gapX1} height={160} fill="rgba(0,0,0,0.6)" />
      {/* Void glow edges */}
      <rect x={gapX1} y={gapY} width={4} height={160} fill="rgba(183,95,255,0.3)" />
      <rect x={gapX2 - 4} y={gapY} width={4} height={160} fill="rgba(183,95,255,0.15)" />

      {/* Void pixel noise */}
      {Array.from({ length: 24 }).map((_, i) => (
        <rect
          key={i}
          x={gapX1 + 6 + (i % 7) * 14}
          y={gapY + 16 + Math.floor(i / 7) * 36}
          width={6}
          height={6}
          fill={P}
          opacity={0.05 + (i % 5) * 0.025}
        />
      ))}

      {/* Warning symbol in the void */}
      <g transform={`translate(${(gapX1 + gapX2) / 2}, ${gapY + 60})`}>
        <polygon points="0,-24 22,18 -22,18" fill="none" stroke={RED} strokeWidth="2" opacity={0.7} />
        <rect x={-2} y={-10} width={4} height={16} fill={RED} opacity={0.7} rx="1" />
        <rect x={-2} y={10} width={4} height={4} fill={RED} opacity={0.7} rx="1" />
      </g>
      <text
        x={(gapX1 + gapX2) / 2}
        y={gapY + 104}
        textAnchor="middle"
        fill={RED}
        fontSize="7"
        fontFamily="monospace"
        opacity={0.6}
        letterSpacing="1"
      >
        NO TEST ENV
      </text>

      {/* Agent pixel art */}
      {agentPixels.map(([col, row], i) => (
        <rect
          key={i}
          x={agentX + col * CELL}
          y={agentY + row * CELL}
          width={CELL - 2}
          height={CELL - 2}
          fill={P}
          opacity={0.85}
          rx="1"
        />
      ))}

      {/* Question mark above agent */}
      <text x={agentX + 56} y={agentY - 20} textAnchor="middle" fill={P} fontSize="32" fontFamily="monospace" opacity={0.6}>?</text>

      {/* Disconnected fragments on right */}
      {fragments.map(([x, y], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={10}
          height={10}
          fill={P}
          opacity={0.1 + (i % 4) * 0.05}
          rx="1"
        />
      ))}

      {/* Label under left platform */}
      <text x={115} y={gapY + 30} textAnchor="middle" fill={P} fontSize="8" fontFamily="monospace" opacity={0.45} letterSpacing="1">
        PRODUCTION
      </text>

      {/* Label under right platform */}
      <text x={337} y={gapY + 30} textAnchor="middle" fill={P} fontSize="8" fontFamily="monospace" opacity={0.2} letterSpacing="1">
        TESTING
      </text>

      {/* Scan lines — atmosphere */}
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1={0} y1={100 + i * 90} x2={384} y2={100 + i * 90} stroke={P} strokeWidth="0.3" opacity={0.08} />
      ))}

      {/* Corner markers */}
      {[[20, 20], [364, 20], [20, 540], [364, 540]].map(([x, y], i) => (
        <rect key={i} x={x - 2} y={y - 2} width={4} height={4} fill={P} opacity={0.15} />
      ))}
    </svg>
  )
}
