let csrf = null

async function csrfToken() {
  if (!csrf) {
    const response = await fetch('/api/csrf', { credentials: 'same-origin' })
    if (!response.ok) throw new Error('服务器暂时没有响应，请稍后再试')
    csrf = await response.json()
  }
  return csrf
}

export async function api(path, options = {}) {
  const method = options.method || 'GET'
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = await csrfToken()
    headers[token.headerName] = token.token
  }
  let response
  try {
    response = await fetch(path, { ...options, method, headers, credentials: 'same-origin', body: options.body ? JSON.stringify(options.body) : undefined })
  } catch {
    throw new Error('连接服务器失败，请检查网络后重试')
  }
  if (!response.ok) {
    if (response.status === 403) csrf = null
    const data = await response.json().catch(() => ({}))
    const error = new Error(data.message || `请求失败（${response.status}）`)
    error.status = response.status
    throw error
  }
  return response.status === 204 ? null : response.json()
}
export function resetCsrf() { csrf = null }
