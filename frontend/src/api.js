const KEY = 'cairn_token'

export const store = {
  get() { try { return localStorage.getItem(KEY) } catch { return null } },
  set(t) { try { localStorage.setItem(KEY, t) } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem(KEY) } catch { /* ignore */ } },
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

async function request(method, url, body, isForm) {
  const headers = {}
  const t = store.get()
  if (t) headers.Authorization = `Bearer ${t}`
  if (body && !isForm) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined })
  let data = null
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && t) onUnauthorized()
    let msg = res.statusText
    if (data && data.detail) msg = typeof data.detail === 'string' ? data.detail : data.detail.map((d) => d.msg).join('; ')
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  return data
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  patch: (u, b) => request('PATCH', u, b),
  upload: (u, form) => request('POST', u, form, true),
}
