/**
 * Procedural hero visual: alternate routes in gray converging on one horizon
 * point, and a single route drawn in blue. Pure SVG so it stays crisp,
 * weighs nothing, and holds still for reduced-motion users.
 */
export function RouteField() {
  const vx = 1180
  const vy = 250
  const grays = [
    'M-40,720 C300,640 620,420 ' + `${vx},${vy}`,
    'M-40,610 C340,560 700,380 ' + `${vx},${vy}`,
    'M-40,500 C360,470 760,330 ' + `${vx},${vy}`,
    'M160,760 C420,650 820,420 ' + `${vx},${vy}`,
    'M420,780 C640,660 900,430 ' + `${vx},${vy}`,
    'M-40,400 C420,390 820,300 ' + `${vx},${vy}`,
  ]
  const blue = `M-40,680 C220,660 380,560 520,520 S760,470 860,380 S1060,290 ${vx},${vy}`
  const milestones: [number, number][] = [
    [300, 612],
    [520, 520],
    [760, 430],
    [980, 322],
  ]
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-45 md:opacity-100"
      viewBox="0 0 1440 780"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="horizon" cx={vx / 1440} cy={vy / 780} r="0.55">
          <stop offset="0" stopColor="#2F8CFF" stopOpacity="0.10" />
          <stop offset="1" stopColor="#2F8CFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fadeLeft" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#0B0D0F" stopOpacity="1" />
          <stop offset="0.45" stopColor="#0B0D0F" stopOpacity="0.2" />
          <stop offset="1" stopColor="#0B0D0F" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="1440" height="780" fill="url(#horizon)" />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1="0" x2="1440" y1={330 + i * 52} y2={330 + i * 52} stroke="white" strokeOpacity={0.025} />
      ))}
      {grays.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#A7ADB5" strokeOpacity={0.16} strokeWidth={1} strokeDasharray="1 5" />
      ))}
      <path
        d={blue}
        pathLength={1}
        fill="none"
        stroke="#2F8CFF"
        strokeWidth={1.6}
        strokeLinecap="round"
        className="animate-draw"
        style={{ strokeDasharray: 1, ['--path-length' as string]: 1 }}
      />
      {milestones.map(([x, y], i) => (
        <g key={i} className="animate-fade" style={{ animationDelay: `${500 + i * 260}ms` }}>
          <circle cx={x} cy={y} r={9} fill="#2F8CFF" fillOpacity={0.12} />
          <circle cx={x} cy={y} r={3} fill="#2F8CFF" />
        </g>
      ))}
      <circle cx={vx} cy={vy} r={4} fill="#fff" />
      <rect width="1440" height="780" fill="url(#fadeLeft)" />
    </svg>
  )
}
