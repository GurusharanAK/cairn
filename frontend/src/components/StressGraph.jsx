import React from 'react'
import { LEVELS } from '../ui.jsx'

// Draws "X leaves -> what gets stuck" from the stress-test response.
export default function StressGraph({ member, nodes }) {
  if (!nodes.length) return null
  const cols = {}
  nodes.forEach((n) => {
    const col = n.kind === 'direct' ? 1 : n.path.length
    ;(cols[col] = cols[col] || []).push(n)
  })
  const maxCol = Math.max(...Object.keys(cols).map(Number))
  const rows = Math.max(...Object.values(cols).map((c) => c.length))
  const W = 180 + maxCol * 230
  const H = Math.max(160, rows * 84 + 40)
  const pos = {}
  Object.entries(cols).forEach(([col, list]) => {
    list.forEach((n, i) => {
      pos[n.component] = { x: 40 + Number(col) * 230, y: (H / (list.length + 1)) * (i + 1) }
    })
  })
  const center = { x: 40, y: H / 2 }
  const edges = nodes.map((n) => {
    const from = n.kind === 'direct' ? center : pos[n.path[1]] || center
    return { from, to: pos[n.component], level: n.level, key: n.component }
  })
  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} role="img" aria-label={`If ${member} leaves, these components are affected`} className="min-w-full">
        {edges.map((e) => (
          <path key={e.key} d={`M ${e.from.x + (e.from === center ? 70 : 100)} ${e.from.y} C ${e.from.x + 150} ${e.from.y}, ${e.to.x - 60} ${e.to.y}, ${e.to.x - 8} ${e.to.y}`}
            stroke={LEVELS[e.level].ring} strokeWidth="2" fill="none" opacity="0.8" />
        ))}
        <g>
          <circle cx={center.x + 30} cy={center.y} r="42" fill="#0f1a2b" />
          <text x={center.x + 30} y={center.y - 4} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">{member.split(' ')[0]}</text>
          <text x={center.x + 30} y={center.y + 12} textAnchor="middle" fill="#f2a33a" fontSize="10">leaving</text>
        </g>
        {nodes.map((n) => {
          const p = pos[n.component]
          const l = LEVELS[n.level]
          return (
            <g key={n.component}>
              <rect x={p.x - 8} y={p.y - 26} width="180" height="52" rx="10" fill={l.soft} stroke={l.ring} strokeWidth="2" />
              <text x={p.x + 4} y={p.y - 6} fontSize="13" fontWeight="700" fill="#0f1a2b">{n.component.length > 20 ? n.component.slice(0, 19) + '…' : n.component}</text>
              <text x={p.x + 4} y={p.y + 14} fontSize="11" fontWeight="700" fill={l.ring === '#f2a33a' ? '#8a5a00' : l.ring}>{n.level}{n.kind === 'downstream' ? ' · knock-on' : ''}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
