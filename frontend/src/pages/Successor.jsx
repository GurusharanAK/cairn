import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { Button, Card, Empty, ErrorNote, Tabs, Title, useAction } from '../ui.jsx'
import Snapshot from '../components/Snapshot.jsx'
import Rehearsal from './Rehearsal.jsx'

function Checklist({ pid }) {
  const [data, setData] = useState(null)
  const [notes, setNotes] = useState({})
  const [err, setErr] = useState('')
  const act = useAction()
  const load = useCallback(() => api.get(`/api/projects/${pid}/readiness`).then(setData).catch((e) => setErr(e.message)), [pid])
  useEffect(() => { load() }, [load])
  const submit = (key, status) => act.run(async () => {
    await api.post(`/api/projects/${pid}/readiness`, { item_key: key, status, note: notes[key] || '' })
    await load()
  })
  if (err) return <Empty>{err}</Empty>
  if (!data) return <p className="text-sm text-slate-500">Loading...</p>
  const done = data.items.filter((i) => i.result?.status === 'completed').length
  return (
    <div>
      <Title sub="Mark each step done, or say what is still unclear. Your manager sees the result.">Readiness check: {done} of {data.items.length} done</Title>
      <ErrorNote error={act.error} />
      <div className="space-y-2">
        {data.items.map((s, i) => (
          <Card key={s.key}>
            <p className="text-sm"><b>{i + 1}.</b> {s.text}</p>
            {s.result && <p className={`mt-1 text-xs font-bold ${s.result.status === 'completed' ? 'text-teal' : 'text-danger'}`}>{s.result.status === 'completed' ? 'Done' : `Needs clarification${s.result.note ? `: ${s.result.note}` : ''}`}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="ghost" className="!py-1 text-xs" disabled={act.busy} onClick={() => submit(s.key, 'completed')}>Mark done</Button>
              <input aria-label="What is unclear?" placeholder="What is unclear?" value={notes[s.key] || ''} onChange={(e) => setNotes({ ...notes, [s.key]: e.target.value })} className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
              <Button variant="danger" className="!py-1 text-xs" disabled={act.busy} onClick={() => submit(s.key, 'needs_clarification')}>Needs clarification</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function Successor({ pid, project, user }) {
  const [tab, setTab] = useState('handover')
  const [h, setH] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.get(`/api/projects/${pid}/handover`).then(setH).catch((e) => setErr(e.message)) }, [pid, project.model_version])
  const tabs = [{ id: 'handover', label: 'My handover' }, { id: 'rehearsal', label: 'Rehearsal' }, { id: 'checklist', label: 'Readiness check' }]
  return (
    <div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'handover' && (err ? <Empty>{err}. Your manager has not released the handover yet. You can still use the Rehearsal tab.</Empty>
        : !h ? <p className="text-sm text-slate-500">Loading...</p>
          : <>{h.stale && <p className="mb-3 rounded-lg bg-amber-soft px-3 py-2 text-sm">New information has come in since this handover was approved. Your manager is preparing an update.</p>}
            <Snapshot snap={h.snapshot} pid={pid} /></>)}
      {tab === 'rehearsal' && <Rehearsal pid={pid} user={user} project={project} />}
      {tab === 'checklist' && <Checklist pid={pid} />}
    </div>
  )
}
