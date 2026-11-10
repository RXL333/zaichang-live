const storageKey = 'zaichang.session'
export const apiOrigin = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '')

let csrf = null, sessionReady = false, preparingSession = null
let sessionToken = null
try { sessionToken = sessionStorage.getItem(storageKey) } catch { /* Storage can be disabled. */ }

export function getSessionToken() { return sessionToken }

function saveSession(response, sentToken) {
  const next = response.headers.get('X-Auth-Token')
  if (next === null || sentToken !== sessionToken) return
  if (next !== sessionToken) csrf = null
  sessionToken = next || null
  try {
    if (sessionToken) sessionStorage.setItem(storageKey, sessionToken)
    else sessionStorage.removeItem(storageKey)
  } catch { /* The current tab can still use its in-memory session. */ }
}

async function request(path, options = {}) {
  const sentToken = sessionToken
  const headers = { ...options.headers, ...(sentToken ? { 'X-Auth-Token': sentToken } : {}) }
  let response
  try {
    response = await fetch(`${apiOrigin}${path}`, { ...options, headers, credentials: 'omit' })
  } catch {
    throw new Error('连接服务器失败，请检查网络后重试')
  }
  saveSession(response, sentToken)
  return response
}

async function csrfToken() {
  if (!csrf) {
    const response = await request('/api/csrf')
    if (!response.ok) throw new Error('服务器暂时没有响应，请稍后再试')
    csrf = await response.json()
  }
  return csrf
}

async function prepareSession() {
  if (sessionReady) return
  if (!preparingSession) {
    preparingSession = (async () => {
      for (let attempt = 0; ; attempt++) {
        try { await csrfToken(); sessionReady = true; return }
        catch (error) {
          if (attempt >= 3) throw error
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 2000))
        }
      }
    })().finally(() => { preparingSession = null })
  }
  await preparingSession
}

export async function api(path, options = {}) {
  await prepareSession()
  const method = (options.method || 'GET').toUpperCase()
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = await csrfToken()
    headers[token.headerName] = token.token
  }
  const response = await request(path, { ...options, method, headers, body: options.body ? JSON.stringify(options.body) : undefined })
  if (!response.ok) {
    if (response.status === 403) csrf = null
    const data = await response.json().catch(() => ({}))
    const error = new Error(data.message || `请求失败（${response.status}）`)
    error.status = response.status
    throw error
  }
  return response.status === 204 ? null : response.json()
}

export function resetCsrf() { csrf = null; sessionReady = false }
