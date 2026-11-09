import React, { useState } from 'react'

export const LABELS = {
  evidence_supported: { text: 'Evidence-supported', cls: 'bg-teal-soft text-teal border-teal/30' },
  missing_evidence: { text: 'Missing evidence', cls: 'bg-amber-soft text-amber-900 border-amber/50' },
  conflicting: { text: 'Conflicting', cls: 'bg-danger-soft text-danger border-danger/30' },
  unverified: { text: 'Unverified', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
}

export function Label({ value }) {
  const l = LABELS[value] || LABELS.unverified
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${l.cls}`}>{l.text}</span>
}

export const LEVELS = {
  HIGH: { cls: 'bg-danger text-white', ring: '#c0392b', soft: '#fbe9e7' },
  MEDIUM: { cls: 'bg-amber text-ink', ring: '#f2a33a', soft: '#fdf1dc' },
  LOW: { cls: 'bg-teal text-white', ring: '#0f7b6c', soft: '#e3f2ef' },
}

export function Level({ value }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold tracking-wide ${LEVELS[value].cls}`}>{value}</span>
}

export function Card({ children, className = '' }) {
  return <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>
}

export function Button({ children, variant = 'primary', className = '', ...rest }) {
  const v = {
    primary: 'bg-teal text-white hover:bg-teal/90 disabled:bg-slate-300',
    dark: 'bg-ink text-white hover:bg-ink/90 disabled:bg-slate-300',
    ghost: 'bg-white text-ink border border-slate-300 hover:bg-slate-soft disabled:text-slate-400',
    danger: 'bg-white text-danger border border-danger/40 hover:bg-danger-soft disabled:text-slate-400',
  }[variant]
  return (
    <button {...rest} className={`rounded-lg px-3.5 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed ${v} ${className}`}>
      {children}
    </button>
  )
}

export function Title({ children, sub }) {
  return (
    <div className="mb-4">
      <h2 className="text-2xl font-bold text-ink">{children}</h2>
      {sub && <p className="mt-1 text-sm text-slate-600">{sub}</p>}
    </div>
  )
}

export function ErrorNote({ error }) {
  if (!error) return null
  return <p role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
}

export function Empty({ children }) {
  return <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">{children}</p>
}

export function ScoreRing({ value, size = 64 }) {
  const v = value ?? 0
  const col = v >= 80 ? '#0f7b6c' : v >= 55 ? '#f2a33a' : '#c0392b'
  const r = size / 2 - 6
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} role="img" aria-label={`Continuity score ${value ?? 'not available'} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#e5eaf0" strokeWidth="6" fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth="6" fill="none" strokeLinecap="round"
        strokeDasharray={`${(c * v) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size / 3.2} fontWeight="700" fill="#0f1a2b">
        {value ?? '-'}
      </text>
    </svg>
  )
}

export function Logo({ className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <ellipse cx="16" cy="25" rx="11" ry="5" fill="#0f7b6c" />
      <ellipse cx="16" cy="17" rx="8" ry="4" fill="#f2a33a" />
      <ellipse cx="16" cy="10" rx="5" ry="3" fill="#0f1a2b" />
    </svg>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-bold ${value === t.id ? 'border-teal text-teal' : 'border-transparent text-slate-600 hover:text-ink'}`}>
          {t.label}{t.badge ? <span className="ml-1.5 rounded-full bg-amber px-1.5 text-xs text-ink">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (fn) => {
    setBusy(true)
    setError('')
    try { return await fn() } catch (e) { setError(e.message || 'Something went wrong'); return undefined } finally { setBusy(false) }
  }
  return { busy, error, run, setError }
}
