import React from 'react'
import { Card, Label, ScoreRing, Level, Empty } from '../ui.jsx'
import Evidence from './Evidence.jsx'

const ST = { done: 'Done', in_progress: 'In progress', todo: 'To do', blocked: 'Blocked' }

function Section({ title, children, hint }) {
  return (
    <section className="mb-7">
      <h3 className="serif mb-1 text-xl font-bold">{title}</h3>
      {hint && <p className="mb-3 text-sm text-slate-600">{hint}</p>}
      <div className="space-y-2">{children}</div>
    </section>
  )
}

export default function Snapshot({ snap, pid }) {
  const ev = (e) => <Evidence items={e} pid={pid} />
  return (
    <div>
      <Card className="mb-6 flex items-center gap-5 bg-ink text-white">
        <ScoreRing value={snap.overall_score} size={76} />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber">Handover</p>
          <p className="serif text-xl font-bold">{snap.project}</p>
          <p className="text-sm text-slate-300">
            From {snap.departing_member}{snap.successor ? ` to ${snap.successor}` : ''}. Every statement below shows how well it is supported.
          </p>
        </div>
      </Card>

      <Section title="My next steps" hint="Do these in order. Steps that mention a gap are things nobody has written down yet.">
        {snap.next_steps.length === 0 ? <Empty>No open steps.</Empty> : snap.next_steps.map((s, i) => (
          <Card key={s.key} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal text-xs font-bold text-white">{i + 1}</span>
            <div className="flex-1 text-sm">{s.text}</div>
            <Label value={s.label} />
          </Card>
        ))}
      </Section>

      <Section title="Project status">
        <div className="grid gap-3 md:grid-cols-2">
          {[['Pending work', snap.status.pending], ['Completed work', snap.status.completed]].map(([h, list]) => (
            <Card key={h}>
              <h4 className="mb-2 font-bold">{h} ({list.length})</h4>
              {list.length === 0 && <p className="text-sm text-slate-500">Nothing here.</p>}
              <ul className="space-y-2">
                {list.map((t, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{t.title}</span>
                      <span className="text-slate-500">{ST[t.status]}{t.owner ? ` · ${t.owner}` : ' · no owner'}</span>
                      {t.label !== 'evidence_supported' && <Label value={t.label} />}
                    </div>
                    <div className="mt-1">{ev(t.evidence)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Decision history" hint="A decision with no recorded reason is marked as missing. Cairn never makes a reason up.">
        {snap.decisions.length === 0 && <Empty>No decisions found.</Empty>}
        {snap.decisions.map((d, i) => (
          <Card key={i}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{d.title}</span>
              <Label value={d.label} />
              {d.reason_origin === 'approved_answer' && <span className="text-xs text-slate-500">reason from a reviewed answer</span>}
            </div>
            <p className="mt-1 text-sm">{d.reason ? <><b>Why:</b> {d.reason}</> : <i className="text-slate-500">Reason unknown. Ask in the Rehearsal tab.</i>}</p>
            {d.decided_by && <p className="text-xs text-slate-500">Decided by {d.decided_by}</p>}
            <div className="mt-1">{ev(d.evidence)}</div>
          </Card>
        ))}
      </Section>

      <Section title="Components and who owns them" hint="The score is a plain breakdown of how well each part is documented. It is not a prediction of failure.">
        <div className="grid gap-3 md:grid-cols-2">
          {snap.components.map((c) => (
            <Card key={c.name}>
              <div className="flex items-center gap-3">
                <ScoreRing value={c.score} size={52} />
                <div className="flex-1">
                  <p className="font-bold">{c.name}</p>
                  <p className="text-xs text-slate-600">Owner: {c.owner || 'unknown'}</p>
                </div>
                <Label value={c.label} />
              </div>
              {c.description && <p className="mt-2 text-sm">{c.description}</p>}
              <ul className="mt-2 text-xs text-slate-600">
                {Object.entries(c.breakdown).map(([k, b]) => (
                  <li key={k}>{k.replace(/_/g, ' ')}: <b>{b.points}/{b.max}</b> ({b.note})</li>
                ))}
              </ul>
              <div className="mt-2">{ev(c.evidence)}</div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Dependencies and risks">
        {snap.dependencies.map((d, i) => (
          <Card key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <b>{d.from}</b> needs <b>{d.to}</b>
            <Label value={d.label} />
            {!d.documented && <span className="text-xs text-slate-500">only seen in code history, so confirm it</span>}
            <span className="ml-auto">{ev(d.evidence)}</span>
          </Card>
        ))}
        {snap.risks.map((r) => (
          <Card key={r.component} className="text-sm">
            <div className="mb-1 flex items-center gap-2"><Level value={r.level} /><b>{r.component}</b></div>
            <ul className="list-disc pl-5">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </Card>
        ))}
      </Section>

      <Section title="Known problems">
        {snap.known_problems.length === 0 && <Empty>No recorded problems.</Empty>}
        {snap.known_problems.map((p, i) => (
          <Card key={i}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{p.issue}</span>
              {p.recurring && <span className="rounded bg-amber-soft px-1.5 text-xs font-bold text-amber-900">recurring</span>}
              <Label value={p.label} />
            </div>
            <ol className="mt-2 space-y-1 text-sm">
              {p.attempts.map((a, j) => (
                <li key={j}>
                  Attempt {a.attempt || '-'}: <b className={a.outcome === 'worked' ? 'text-teal' : a.outcome === 'failed' ? 'text-danger' : ''}>{a.outcome}</b> - {a.detail}
                  <span className="ml-2">{ev(a.evidence)}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </Section>

      <Section title="Key contacts">
        {snap.contacts.length === 0 && <Empty>No contacts recorded.</Empty>}
        {snap.contacts.map((c, i) => (
          <Card key={i} className="flex flex-wrap items-center gap-2 text-sm"><b>{c.name}</b> {c.role}<span className="ml-auto">{ev(c.evidence)}</span></Card>
        ))}
      </Section>

      <Section title="Open questions" hint="Marked unknown or unverified on purpose.">
        {snap.open_questions.length === 0 && <Empty>Nothing open.</Empty>}
        {snap.open_questions.map((q, i) => (
          <Card key={i} className="text-sm">
            <div className="flex flex-wrap items-center gap-2"><Label value={q.label} /><span>{q.text}</span></div>
            <div className="mt-1">{ev(q.evidence)}</div>
          </Card>
        ))}
      </Section>

      {snap.approved_answers.length > 0 && (
        <Section title="Reviewed answers">
          {snap.approved_answers.map((a) => (
            <Card key={a.question_id} className="text-sm"><b>{a.question}</b><p className="mt-1">{a.answer}</p><p className="text-xs text-slate-500">Approved by {a.approved_by}</p></Card>
          ))}
        </Section>
      )}
    </div>
  )
}
