import React, { useCallback, useEffect, useState } from 'react'
import { api, setUnauthorizedHandler, store } from './api.js'
import { Button, Empty, Logo } from './ui.jsx'
import Login from './pages/Login.jsx'
import Manager from './pages/Manager.jsx'
import Departing from './pages/Departing.jsx'
import Successor from './pages/Successor.jsx'

const ROLE = { admin: 'Admin', manager: 'Manager', departing: 'Departing member', incoming: 'Incoming member' }

export default function App() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [projects, setProjects] = useState([])
  const [pid, setPid] = useState(null)
  const [project, setProject] = useState(null)
  const [err, setErr] = useState('')

  const logout = useCallback(() => { store.clear(); setUser(null); setProjects([]); setPid(null); setProject(null) }, [])
  useEffect(() => { setUnauthorizedHandler(logout) }, [logout])
  useEffect(() => {
    if (!store.get()) { setReady(true); return }
    api.get('/api/me').then(setUser).catch(() => store.clear()).finally(() => setReady(true))
  }, [])
  useEffect(() => {
    if (!user) return
    api.get('/api/projects').then((ps) => { setProjects(ps); if (ps.length && pid == null) setPid(ps[0].id) }).catch((e) => setErr(e.message))
  }, [user])
  const reload = useCallback(async () => { if (pid != null) setProject(await api.get(`/api/projects/${pid}`)) }, [pid])
  useEffect(() => { if (pid != null) reload().catch((e) => setErr(e.message)) }, [pid, reload])

  if (!ready) return <p className="p-8 text-slate-500">Loading...</p>
  if (!user) return <Login onDone={setUser} />
  const reviewer = user.role === 'manager' || user.role === 'admin'
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Logo /><span className="serif text-2xl font-bold">Cairn</span>
          {projects.length > 1 && (
            <select aria-label="Project" value={pid ?? ''} onChange={(e) => setPid(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {project && <span className="hidden text-sm text-slate-600 md:inline">{project.name}</span>}
          <span className="ml-auto text-sm"><b>{user.name}</b> <span className="text-slate-500">· {ROLE[user.role]}</span></span>
          <Button variant="ghost" className="!py-1" onClick={logout}>Sign out</Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {err && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}
        {!project ? <Empty>{projects.length === 0 ? 'No projects yet.' : 'Loading...'}</Empty> : (
          <>
            {reviewer && <Manager pid={pid} project={project} reload={reload} user={user} />}
            {user.role === 'departing' && <Departing pid={pid} project={project} />}
            {user.role === 'incoming' && <Successor pid={pid} project={project} user={user} />}
          </>
        )}
      </main>
    </div>
  )
}
