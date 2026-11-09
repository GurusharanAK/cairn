import React, { useState } from 'react'
import { api } from '../api.js'

export default function Evidence({ items, pid }) {
  const [open, setOpen] = useState(null)
  const [src, setSrc] = useState(null)
  const [err, setErr] = useState('')
  const seen = new Set()
  items = (items || []).filter((e) => { const k = `${e.source_id}|${e.loc}`; if (seen.has(k)) return false; seen.add(k); return true })
  if (items.length === 0) return <span className="text-xs italic text-slate-500">no evidence</span>

  const show = async (e) => {
    setOpen(e)
    setSrc(null)
    setErr('')
    try { setSrc(await api.get(`/api/projects/${pid}/sources/${e.source_id}`)) } catch (x) { setErr(x.message) }
  }
  const lineNo = open && /^line (\d+)$/.exec(open.loc)
  return (
    <>
      <span className="inline-flex flex-wrap gap-1">
        {items.map((e, i) => (
          <button key={i} onClick={() => show(e)} title="Open the source"
            className="rounded border border-slate-300 bg-slate-soft px-1.5 py-0.5 text-xs text-slate-700 hover:border-teal hover:text-teal">
            {e.name} · {e.loc}
          </button>
        ))}
      </span>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{open.name}</h3>
                <p className="text-xs text-slate-500">Location: {open.loc}</p>
              </div>
              <button onClick={() => setOpen(null)} className="rounded border border-slate-300 px-2 py-1 text-sm font-bold">Close</button>
            </div>
            {err && <p className="text-sm text-danger">{err}</p>}
            {!src && !err && <p className="text-sm text-slate-500">Loading...</p>}
            {src && (
              <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-soft p-3 text-xs leading-relaxed">
                {src.content.split('\n').map((l, i) => (
                  <div key={i} className={lineNo && Number(lineNo[1]) === i + 1 ? 'bg-amber/40 font-bold' : ''}>{l || ' '}</div>
                ))}
              </pre>
            )}
          </div>
        </div>
      )}
    </>
  )
}
