import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { Button, Card, ErrorNote, useAction } from '../ui.jsx'

const STATUS = {
  answered: 'Answered from evidence', awaiting_member: 'Waiting for the departing member', proposed: 'Reply under review',
  approved: 'Answered (reviewed)', rejected: 'Closed',
}

export default function Rehearsal({ pid, user, project }) {
  const [list, setList] = useState([])
  const [text, setText] = useState('')
  const act = useAction()
  const end = useRef(null)
  const load = useCallback(async () => {
    const rows = await api.get(`/api/projects/${pid}/questions`)
    setList(rows.filter((q) => q.asker === user.name).reverse())
  }, [pid, user.name])
  useEffect(() => { load().catch(() => {}) }, [load, project?.model_version])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [list.length])

  const ask = (e) => {
    e.preventDefault()
    if (text.trim().length < 4) return
    act.run(async () => { await api.post(`/api/projects/${pid}/rehearsal/ask`, { text }); setText(''); await load() })
  }
  const starters = ['Why is the payment retry limit 3?', 'Why did we choose PostgreSQL?', 'Who is the payment gateway vendor liaison?']
  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold">Handover Rehearsal</h2>
      <p className="mb-4 text-sm text-slate-600">Ask anything about the project. Answers come only from approved sources and always show where they came from. If the evidence is not enough, Cairn says so and asks the departing member.</p>
      <div className="mb-4 space-y-4">
        {list.length === 0 && (
          <Card><p className="mb-2 text-sm text-slate-600">Try one of these:</p>
            <div className="flex flex-wrap gap-2">{starters.map((s) => <button key={s} onClick={() => setText(s)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm hover:border-teal hover:text-teal">{s}</button>)}</div></Card>
        )}
        {list.map((q) => (
          <div key={q.id} className="space-y-2">
            <div className="ml-auto max-w-[85%] rounded-xl bg-ink px-3 py-2 text-sm text-white">{q.text}</div>
            <div className={`max-w-[92%] rounded-xl border px-3 py-2 text-sm ${q.status === 'answered' || q.status === 'approved' ? 'border-teal/30 bg-teal-soft' : 'border-amber/50 bg-amber-soft'}`}>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-600">{STATUS[q.status] || q.status}</p>
              {(q.status === 'answered' || q.status === 'approved') && q.answer ? (
                <>
                  <p className="whitespace-pre-wrap">{q.answer}</p>
                  {q.answer_sources.length > 0 && <p className="mt-1 text-xs text-slate-600">Sources: {q.answer_sources.map((s) => `${s.name} (${s.loc})`).join('; ')}</p>}
                </>
              ) : (
                <p>I can't verify this from the approved sources, so I won't guess. {q.status === 'proposed' ? 'The departing member has replied and a manager is reviewing it.' : 'Your question has gone to the departing member with the related context.'}</p>
              )}
              {q.review_note && q.status === 'awaiting_member' && <p className="mt-1 text-xs text-slate-600">Review note: {q.review_note}</p>}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <ErrorNote error={act.error} />
      <form onSubmit={ask} className="flex gap-2">
        <label htmlFor="ask" className="sr-only">Your question</label>
        <input id="ask" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about a decision, owner, dependency or problem..." className="flex-1 rounded-lg border border-slate-300 px-3 py-2" maxLength={1000} />
        <Button type="submit" disabled={act.busy || text.trim().length < 4}>{act.busy ? 'Checking...' : 'Ask'}</Button>
      </form>
    </div>
  )
}
