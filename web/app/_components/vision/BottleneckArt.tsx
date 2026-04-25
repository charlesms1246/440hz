export function BottleneckArt() {
  const P = '#b75fff'
  const PD = 'rgba(183,95,255,0.35)'
  const PF = 'rgba(183,95,255,0.12)'

  // Source nodes: 14 scattered across top half
  const nodes = [
    [28, 48], [82, 28], [136, 58], [196, 34], [252, 52], [308, 30], [352, 56],
    [48, 118], [104, 98], [160, 128], [218, 104], [272, 122], [326, 100], [368, 128],
  ]

  const cx = 192
  const funnelY = 290

  return (
    <svg viewBox="0 0 384 560" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
      {/* Glow behind funnel */}
      <ellipse cx={cx} cy={funnelY} rx={60} ry={40} fill={PF} />

      {/* Lines from nodes to funnel center */}
      {nodes.map(([x, y], i) => (
        <line key={i} x1={x + 6} y1={y + 6} x2={cx} y2={funnelY} stroke={PD} strokeWidth="1" />
      ))}

      {/* Source nodes */}
      {nodes.map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width={14} height={14} fill={PF} stroke={P} strokeWidth="1.2" rx="1" />
          {/* inner pixel detail */}
          <rect x={x + 3} y={y + 3} width={4} height={4} fill={P} opacity={0.6} />
          <rect x={x + 8} y={y + 8} width={3} height={3} fill={P} opacity={0.4} />
        </g>
      ))}

      {/* Funnel neck — narrowing channel */}
      <path
        d={`M ${cx - 56} ${funnelY - 28} L ${cx + 56} ${funnelY - 28} L ${cx + 6} ${funnelY + 30} L ${cx - 6} ${funnelY + 30} Z`}
        fill="rgba(183,95,255,0.08)"
        stroke={P}
        strokeWidth="1.2"
      />

      {/* Bottleneck label */}
      <rect x={cx - 38} y={funnelY - 14} width={76} height={18} fill="rgba(183,95,255,0.15)" rx="2" />
      <text x={cx} y={funnelY - 2} textAnchor="middle" fill={P} fontSize="9" fontFamily="monospace" letterSpacing="1">
        BOTTLENECK
      </text>

      {/* Neck pipe going down */}
      <rect x={cx - 5} y={funnelY + 30} width={10} height={48} fill={PD} />

      {/* Central server block — composed of pixel stacks */}
      {[0, 1, 2, 3].map(i => (
        <g key={i}>
          <rect
            x={cx - 64}
            y={390 + i * 36}
            width={128}
            height={28}
            fill="rgba(183,95,255,0.1)"
            stroke={P}
            strokeWidth="1.2"
            rx="2"
          />
          {/* LED indicators */}
          <rect x={cx - 56} y={397 + i * 36} width={6} height={6} fill={i === 0 ? P : PD} rx="1" />
          <rect x={cx - 44} y={397 + i * 36} width={6} height={6} fill={PD} rx="1" />
          <rect x={cx + 44} y={397 + i * 36} width={6} height={6} fill={PD} rx="1" />
          {/* Pixel noise detail */}
          {[0, 1, 2, 3, 4, 5, 6].map(j => (
            <rect
              key={j}
              x={cx - 28 + j * 10}
              y={400 + i * 36}
              width={6}
              height={4}
              fill={P}
              opacity={0.12 + (j % 3) * 0.08}
            />
          ))}
        </g>
      ))}

      {/* Label */}
      <text x={cx} y={548} textAnchor="middle" fill={P} fontSize="8" fontFamily="monospace" opacity={0.5} letterSpacing="2">
        CENTRALIZED SERVER
      </text>

      {/* Pixel noise corners */}
      {[[0, 0], [370, 0], [0, 546], [370, 546]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={4} height={4} fill={P} opacity={0.15} />
      ))}
    </svg>
  )
}
