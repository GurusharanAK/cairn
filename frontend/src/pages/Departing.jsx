import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { Button, Card, Empty, ErrorNote, Label, Level, Title, useAction } from '../ui.jsx'
import Evidence from '../components/Evidence.jsx'

export default function Departing({ pid, project }) {
  const [gaps, setGaps] = useState([])
  const [qs, setQs] = useState([])
  const [draft, setDraft] = useState({})
  const act = useAction()
  const load = useCallback(async () => {
    const [g, q] = await Promise.all([api.get(`/api/projects/${pid}/gaps`), api.get(`/api/projects/${pid}/questions`)])
    setGaps(g)
    setQs(q)
  }, [pid])
  useEffect(() => { load().catch((e) => act.setError(e.message)) }, [load, project.model_version])
  const gapByKey = Object.fromEntries(gaps.map((g) => [g.key, g]))
  const reply = (id) => act.run(async () => {
    await api.post(`/api/projects/${pid}/questions/${id}/reply`, { answer: draft[id] })
    setDraft({ ...draft, [id]: '' })
    await load()
  })
  const todo = qs.filter((q) => q.status === 'queued' || q.status === 'awaiting_member')
  const waiting = qs.filter((q) => q.status === 'proposed')
  return (
    <div>
      <Title sub="These are the things nobody else could learn from the project's documents. Your answers go to a manager for review before anyone relies on them.">
        Questions for you ({todo.length})
      </Title>
      <ErrorNote error={act.error} />
      {todo.length === 0 && <Empty>Nothing waiting for you. Thank you.</Empty>}
      <div className="space-y-3">
        {todo.map((q) => {
          const g = gapByKey[q.gap_key]
          return (
            <Card key={q.id}>
              <div className="flex flex-wrap items-center gap-2">
                {g && <Level value={g.severity === 'high' ? 'HIGH' : 'MEDIUM'} />}
                {g && <Label value={g.label} />}
                <span className="text-xs text-slate-500">{q.asker_role === 'system' ? 'Flagged by Cairn' : `Asked by ${q.asker}`}</span>
              </div>
              <p className="mt-1 font-bold">{q.text}</p>
              {g && <p className="mt-1 text-sm text-slate-600">{g.description}</p>}
              {q.review_note && <p className="mt-1 rounded bg-amber-soft px-2 py-1 text-sm">The reviewer sent this back: {q.review_note}</p>}
              {q.context.length > 0 && (
                <div className="mt-2 rounded-lg bg-slate-soft p-2 text-xs"><b>Related notes found:</b>
                  <ul className="mt-1 list-disc pl-4">{q.context.map((c, i) => <li key={i}>{c.text} <i>({c.name}, {c.loc})</i></li>)}</ul></div>
              )}
              {g && g.evidence.length > 0 && <div className="mt-2"><Evidence items={g.evidence} pid={pid} /></div>}
              <label htmlFor={`r${q.id}`} className="mt-3 block text-xs font-bold">Your answer</label>
              <textarea id={`r${q.id}`} rows={3} value={draft[q.id] || ''} onChange={(e) => setDraft({ ...draft, [q.id]: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
              <Button className="mt-2" disabled={act.busy || (draft[q.id] || '').trim().length < 3} onClick={() => reply(q.id)}>Send for review</Button>
            </Card>
          )
        })}
      </div>
      {waiting.length > 0 && (
        <>
          <h3 className="serif mt-6 mb-2 text-lg font-bold">Sent for review ({waiting.length})</h3>
          {waiting.map((q) => <Card key={q.id} className="mb-2 text-sm"><b>{q.text}</b><p className="text-slate-600">Your answer: {q.answer}</p></Card>)}
        </>
      )}
    </div>
  )
}
