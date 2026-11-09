import React, { useState } from 'react'
import { api, store } from '../api.js'
import { Button, ErrorNote, Logo } from '../ui.jsx'

const DEMO = [
  ['Manager', 'manager@cairn.demo'],
  ['Departing member', 'departing@cairn.demo'],
  ['Incoming member', 'incoming@cairn.demo'],
  ['Admin', 'admin@cairn.demo'],
]

export default function Login({ onDone }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api.post('/api/auth/login', { email, password })
      store.set(r.token)
      onDone(r.user)
    } catch (x) {
      setError(x.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <div className="mb-6 flex items-center gap-3"><Logo className="h-10 w-10" /><h1 className="text-4xl font-bold">Cairn</h1></div>
      <p className="serif mb-1 text-xl font-semibold">Don't just transfer the work. Transfer the understanding behind it.</p>
      <p className="mb-6 text-sm text-slate-600">Project Continuity Intelligence Platform</p>
      <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <ErrorNote error={error} />
        <label className="mb-1 block text-sm font-bold" htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username"
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2" />
        <label className="mb-1 block text-sm font-bold" htmlFor="pw">Password</label>
        <input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2" />
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in...' : 'Sign in'}</Button>
      </form>
      <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Demo accounts (synthetic data)</p>
        <div className="flex flex-wrap gap-2">
          {DEMO.map(([label, em]) => (
            <button key={em} type="button" onClick={() => { setEmail(em); setPassword('cairn-demo') }}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold hover:border-teal hover:text-teal">{label}</button>
          ))}
        </div>
      </div>
    </main>
  )
}
