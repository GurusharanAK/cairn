import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { Button, Card, Empty, ErrorNote, Label, Level, ScoreRing, Tabs, Title, useAction } from '../ui.jsx'
import Evidence from '../components/Evidence.jsx'
import StressGraph from '../components/StressGraph.jsx'
import Snapshot from '../components/Snapshot.jsx'
import Rehearsal from './Rehearsal.jsx'

const KIND = {
  reason_missing: 'Missing reason', single_owner: 'Single point of knowledge', unassigned_task: 'Unassigned task',
  invisible_work: 'Invisible work', conflict: 'Conflict', undocumented_dependency: 'Hidden dependency',
  unresolved_failure: 'Unresolved problem', unanswered_question: 'Unanswered question',
}

function Overview({ pid, project, reload, setTab }) {
  const [score, setScore] = useState(null)
  const [sources, setSources] = useState([])
  const act = useAction()
  const [repo, setRepo] = useState('')
  const [token, setToken] = useState('')
  const [shared, setShared] = useState(true)
  const [info, setInfo] = useState('')

  const load = useCallback(async () => {
    setSources(await api.get(`/api/projects/${pid}/sources`))
    if (project.analysed) setScore(await api.get(`/api/projects/${pid}/score`))
  }, [pid, project.analysed, project.model_version])
  useEffect(() => { load().catch(() => {}) }, [load])

  const analyze = () => act.run(async () => {
    const r = await api.post(`/api/projects/${pid}/analyze`)
    setInfo(`Analysis complete: ${r.components} components, ${r.decisions} decisions, ${r.open_gaps} open gaps.`)
    await reload()
  })
  const upload = (e) => {
    const f = e.target.files[0]
    if (!f) return
    const form = new FormData()
    form.append('file', f)
    form.append('restricted', String(!shared))
    act.run(async () => { await api.upload(`/api/projects/${pid}/sources`, form); setInfo(`Added ${f.name}. Run the analysis to include it.`); await load() })
    e.target.value = ''
  }
  const toggle = (s) => act.run(async () => { await api.patch(`/api/projects/${pid}/sources/${s.id}`, { restricted: !s.restricted }); setInfo('Visibility changed. Run the analysis again to apply it.'); await load() })
  const gh = () => act.run(async () => {
    await api.post(`/api/projects/${pid}/sources/github`, { repo, token: token || null, restricted: !shared })
    setRepo(''); setToken(''); setInfo('GitHub data added. Run the analysis to include it.'); await load()
  })

  return (
    <div className="space-y-5">
      <ErrorNote error={act.error} />
      {info && <p role="status" className="rounded-lg bg-teal-soft px-3 py-2 text-sm text-teal">{info}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex items-center gap-4 md:col-span-1">
          <ScoreRing value={project.overall_score} size={84} />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Continuity Score</p>
            <p className="text-sm text-slate-600">{project.analysed ? 'Average of all components. A breakdown, not a prediction.' : 'Run the analysis to see it.'}</p>
          </div>
        </Card>
        <Card className="md:col-span-2">
          <p className="mb-2 text-sm"><b>{project.departing_member}</b> is leaving{project.successor ? <>; <b>{project.successor}</b> takes over</> : ''}.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={analyze} disabled={act.busy}>{act.busy ? 'Working...' : project.analysed ? 'Re-run analysis' : 'Run analysis'}</Button>
            {project.analysed && <Button variant="ghost" onClick={() => setTab('stress')}>See the Stress Test</Button>}
          </div>
          {project.handover_stale && <p className="mt-2 text-sm text-danger">The approved handover is out of date. Draft and approve a new one.</p>}
        </Card>
      </div>

      {score && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {score.components.map((c) => (
            <Card key={c.name}>
              <div className="flex items-center gap-3"><ScoreRing value={c.score} size={48} /><b>{c.name}</b></div>
              <ul className="mt-2 text-xs text-slate-600">
                {Object.entries(c.breakdown).map(([k, b]) => <li key={k}>{k.replace(/_/g, ' ')}: <b>{b.points}/{b.max}</b></li>)}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <div>
        <h3 className="serif mb-2 text-xl font-bold">Sources</h3>
        <Card className="mb-3">
          <p className="mb-2 text-sm text-slate-600">Add documents (.md .txt .pdf .docx), task exports (.csv .json) or a GitHub export (.json). Restricted sources are never used for the successor's model, answers or handover.</p>
          <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />Share with the successor (untick to restrict)</label>
          <input type="file" aria-label="Upload a source file" onChange={upload} className="mb-3 block text-sm" accept=".md,.txt,.pdf,.docx,.csv,.json,.markdown,.log" />
          <div className="flex flex-wrap items-end gap-2">
            <div><label htmlFor="repo" className="block text-xs font-bold">GitHub repo (owner/name)</label>
              <input id="repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="acme/app" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></div>
            <div><label htmlFor="ghtoken" className="block text-xs font-bold">Token (private repos, not stored)</label>
              <input id="ghtoken" type="password" value={token} onChange={(e) => setToken(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></div>
            <Button variant="ghost" onClick={gh} disabled={!repo || act.busy}>Fetch from GitHub</Button>
          </div>
        </Card>
        <div className="space-y-2">
          {sources.map((s) => (
            <Card key={s.id} className="flex flex-wrap items-center gap-3 text-sm">
              <b>{s.name}</b><span className="text-slate-500">{s.kind.replace('_', ' ')}</span>
              {s.restricted ? <span className="rounded bg-danger-soft px-1.5 py-0.5 text-xs font-bold text-danger">Restricted</span>
                : <span className="rounded bg-teal-soft px-1.5 py-0.5 text-xs font-bold text-teal">Shared</span>}
              {s.kind !== 'approved_answer' && <Button variant="ghost" className="ml-auto !px-2 !py-1 text-xs" onClick={() => toggle(s)} disabled={act.busy}>{s.restricted ? 'Share' : 'Restrict'}</Button>}
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

function Gaps({ pid, project }) {
  const [gaps, setGaps] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.get(`/api/projects/${pid}/gaps`).then(setGaps).catch((e) => setErr(e.message)) }, [pid, project.model_version])
  if (err) return <ErrorNote error={err} />
  if (!gaps) return <p className="text-sm text-slate-500">Loading...</p>
  const open = gaps.filter((g) => g.status === 'open')
  const done = gaps.filter((g) => g.status === 'resolved')
  return (
    <div>
      <Title sub="Each gap is something nobody has recorded, with the evidence that shows why it was flagged.">Knowledge gaps ({open.length} open)</Title>
      <div className="space-y-2">
        {open.length === 0 && <Empty>No open gaps.</Empty>}
        {open.map((g) => (
          <Card key={g.key}>
            <div className="flex flex-wrap items-center gap-2">
              <Level value={g.severity === 'high' ? 'HIGH' : 'MEDIUM'} />
              <b>{KIND[g.kind] || g.kind}</b><Label value={g.label} />
            </div>
            <p className="mt-1 text-sm">{g.description}</p>
            <div className="mt-1"><Evidence items={g.evidence} pid={pid} /></div>
          </Card>
        ))}
        {done.length > 0 && <h3 className="serif pt-3 text-lg font-bold">Resolved ({done.length})</h3>}
        {done.map((g) => (
          <Card key={g.key} className="bg-teal-soft/50">
            <p className="text-sm"><b>{KIND[g.kind] || g.kind}:</b> {g.subject}</p>
            <p className="text-sm text-teal">Resolved: {g.resolution}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Stress({ pid, project }) {
  const [members, setMembers] = useState([])
  const [member, setMember] = useState(project.departing_member)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.get(`/api/projects/${pid}/members`).then(setMembers).catch(() => {}) }, [pid, project.model_version])
  useEffect(() => {
    setErr('')
    api.get(`/api/projects/${pid}/stress-test?member=${encodeURIComponent(member)}`).then(setData).catch((e) => setErr(e.message))
  }, [pid, member, project.model_version])
  const opts = Array.from(new Set([project.departing_member, ...members]))
  return (
    <div>
      <Title sub="What gets stuck, unclear or risky if this person leaves. Risk indicators, not predictions.">Continuity Stress Test</Title>
      <div className="mb-4 flex items-center gap-2 text-sm">
        <label htmlFor="who" className="font-bold">If this person leaves:</label>
        <select id="who" value={member} onChange={(e) => setMember(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5">
          {opts.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <ErrorNote error={err} />
      {data && (
        <>
          <div className="mb-3 flex gap-3 text-sm">
            {['HIGH', 'MEDIUM', 'LOW'].map((l) => <span key={l} className="flex items-center gap-1"><Level value={l} /> {data.counts[l]}</span>)}
          </div>
          <Card className="mb-4"><StressGraph member={member} nodes={data.nodes} /></Card>
          <div className="space-y-2">
            {data.nodes.length === 0 && <Empty>Nothing in the approved sources ties this person to a component.</Empty>}
            {data.nodes.map((n) => (
              <Card key={n.component}>
                <div className="flex flex-wrap items-center gap-2"><Level value={n.level} /><b>{n.component}</b>
                  <span className="text-xs text-slate-500">{n.kind === 'direct' ? `owner: ${n.owner || 'unknown'}` : `knock-on via ${n.path.slice(1).join(' > ')}`}</span></div>
                <ul className="mt-1 list-disc pl-5 text-sm">{n.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                <p className="mt-1 text-sm text-teal"><b>To do:</b> {n.actions.join(' ')}</p>
                <div className="mt-1"><Evidence items={n.evidence} pid={pid} /></div>
              </Card>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">{data.note}</p>
        </>
      )}
    </div>
  )
}

function Review({ pid, project, reload }) {
  const [q, setQ] = useState(null)
  const [edit, setEdit] = useState({})
  const act = useAction()
  const load = useCallback(() => api.get(`/api/projects/${pid}/review`).then(setQ).catch(() => {}), [pid])
  useEffect(() => { load() }, [load, project.model_version])
  const review = (id, action) => act.run(async () => {
    await api.post(`/api/projects/${pid}/questions/${id}/review`, { action, edited_answer: edit[id] || null, note: action === 'reject' ? 'Needs more detail' : null })
    await reload(); await load()
  })
  const draft = () => act.run(async () => { await api.post(`/api/projects/${pid}/handover/draft`); await reload(); await load() })
  const approve = (id) => act.run(async () => { await api.post(`/api/projects/${pid}/handover/${id}/approve`); await reload(); await load() })
  if (!q) return <p className="text-sm text-slate-500">Loading...</p>
  return (
    <div className="space-y-6">
      <ErrorNote error={act.error} />
      <section>
        <Title sub="Replies from the departing member only become evidence after you approve them.">Answers waiting for review ({q.proposed_answers.length})</Title>
        {q.proposed_answers.length === 0 && <Empty>No answers waiting.</Empty>}
        {q.proposed_answers.map((a) => (
          <Card key={a.id} className="mb-3">
            <p className="text-sm"><b>Question ({a.asker}):</b> {a.text}</p>
            <label className="mt-2 block text-xs font-bold" htmlFor={`a${a.id}`}>Answer from {a.proposed_by} (you can edit it)</label>
            <textarea id={`a${a.id}`} rows={3} defaultValue={a.answer} onChange={(e) => setEdit({ ...edit, [a.id]: e.target.value })} className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
            <div className="mt-2 flex gap-2"><Button onClick={() => review(a.id, 'approve')} disabled={act.busy}>Approve as evidence</Button><Button variant="danger" onClick={() => review(a.id, 'reject')} disabled={act.busy}>Send back</Button></div>
          </Card>
        ))}
      </section>
      <section>
        <Title sub="Nothing reaches the successor until a manager or admin approves the handover.">Handover</Title>
        <Button onClick={draft} disabled={act.busy || !project.analysed}>Build a new draft</Button>
        {q.draft_handovers.map((h) => (
          <Card key={h.id} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <b>Draft v{h.version}</b><span className="text-slate-500">by {h.created_by}</span>
            {h.model_version !== project.model_version && <span className="text-danger">out of date</span>}
            <Button className="ml-auto" onClick={() => approve(h.id)} disabled={act.busy || h.model_version !== project.model_version}>Approve and release to the successor</Button>
          </Card>
        ))}
        {project.handover_approved && <p className="mt-3 text-sm text-teal">A handover has been approved and is visible to the successor.</p>}
      </section>
    </div>
  )
}

function HandoverPreview({ pid }) {
  const [h, setH] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.get(`/api/projects/${pid}/handover`).then(setH).catch((e) => setErr(e.message)) }, [pid])
  if (err) return <Empty>{err}. Build a draft in the Review tab.</Empty>
  if (!h) return <p className="text-sm text-slate-500">Loading...</p>
  return (
    <div>
      <p className="mb-3 rounded-lg bg-amber-soft px-3 py-2 text-sm">Showing handover v{h.version} ({h.status}){h.stale ? ' - out of date' : ''}.</p>
      <Snapshot snap={h.snapshot} pid={pid} />
    </div>
  )
}

function Readiness({ pid }) {
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.get(`/api/projects/${pid}/readiness/summary`).then(setR).catch((e) => setErr(e.message)) }, [pid])
  if (err) return <Empty>{err}</Empty>
  if (!r) return <p className="text-sm text-slate-500">Loading...</p>
  return (
    <div>
      <Title sub="How the successor got on with the checklist in the approved handover.">Readiness check</Title>
      {r.successors.length === 0 && <Empty>The successor has not started the checklist yet.</Empty>}
      {r.successors.map((s) => (
        <Card key={s.user} className="mb-3">
          <p><b>{s.user}</b>: {s.completed} of {s.total} steps done</p>
          {s.needs_clarification.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">{s.needs_clarification.map((n, i) => <li key={i}><b>Needs clarification:</b> {n.item}{n.note ? ` - "${n.note}"` : ''}</li>)}</ul>}
        </Card>
      ))}
    </div>
  )
}

function Validation({ pid }) {
  const [v, setV] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.get(`/api/projects/${pid}/validation`).then(setV).catch((e) => setErr(e.message)) }, [pid])
  if (err) return <Empty>{err}</Empty>
  if (!v) return <p className="text-sm text-slate-500">Loading...</p>
  return (
    <div>
      <Title sub="Cairn's output on the synthetic project, checked against the answer key that was written before the analysis.">Validation</Title>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {Object.entries(v.groups).map(([k, g]) => (
          <Card key={k}><p className="text-xs font-bold uppercase tracking-widest text-slate-500">{k.replace('_', ' ')}</p><p className="text-2xl font-bold">{g.passed}/{g.total}</p></Card>
        ))}
        {v.evidence_coverage && <Card><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Handover claims with evidence</p><p className="text-2xl font-bold">{v.evidence_coverage.with_evidence}/{v.evidence_coverage.claims}</p></Card>}
      </div>
      <ul className="space-y-1 text-sm">{v.checks.map((c, i) => <li key={i} className={c.passed ? 'text-teal' : 'font-bold text-danger'}>{c.passed ? 'PASS' : 'FAIL'} · {c.group.replace('_', ' ')} · {c.name}</li>)}</ul>
    </div>
  )
}

function Audit({ pid }) {
  const [rows, setRows] = useState([])
  useEffect(() => { api.get(`/api/projects/${pid}/audit`).then(setRows).catch(() => {}) }, [pid])
  return (
    <div>
      <Title sub="Who did what, newest first.">Audit trail</Title>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm"><thead className="bg-slate-soft text-xs uppercase text-slate-500"><tr><th className="p-2">When</th><th className="p-2">Who</th><th className="p-2">Action</th><th className="p-2">Detail</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100"><td className="p-2 whitespace-nowrap">{new Date(r.ts + 'Z').toLocaleString()}</td><td className="p-2">{r.user} ({r.role})</td><td className="p-2">{r.action}</td><td className="p-2">{r.detail}</td></tr>)}</tbody></table>
      </div>
    </div>
  )
}

export default function Manager({ pid, project, reload, user }) {
  const [tab, setTab] = useState('overview')
  const [pending, setPending] = useState(0)
  useEffect(() => { api.get(`/api/projects/${pid}/review`).then((r) => setPending(r.proposed_answers.length)).catch(() => {}) }, [pid, project.model_version, tab])
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'gaps', label: 'Gaps' },
    { id: 'stress', label: 'Stress Test' },
    { id: 'review', label: 'Review & approve', badge: pending || null },
    { id: 'rehearsal', label: 'Rehearsal' },
    { id: 'handover', label: 'Handover preview' },
    { id: 'readiness', label: 'Readiness' },
    ...(project.has_answer_key ? [{ id: 'validation', label: 'Validation' }] : []),
    { id: 'audit', label: 'Audit' },
  ]
  const needs = !project.analysed && tab !== 'overview'
  return (
    <div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview pid={pid} project={project} reload={reload} setTab={setTab} />}
      {needs ? <Empty>Run the analysis on the Overview tab first.</Empty> : (
        <>
          {tab === 'gaps' && <Gaps pid={pid} project={project} />}
          {tab === 'stress' && <Stress pid={pid} project={project} />}
          {tab === 'review' && <Review pid={pid} project={project} reload={reload} />}
          {tab === 'rehearsal' && <Rehearsal pid={pid} user={user} project={project} />}
          {tab === 'handover' && <HandoverPreview pid={pid} />}
          {tab === 'readiness' && <Readiness pid={pid} />}
          {tab === 'validation' && <Validation pid={pid} />}
          {tab === 'audit' && <Audit pid={pid} />}
        </>
      )}
    </div>
  )
}
