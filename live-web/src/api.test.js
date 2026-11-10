// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function response(body, token, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => name.toLowerCase() === 'x-auth-token' ? token : null },
    json: async () => body,
  }
}

describe('cross-site sessions', () => {
  beforeEach(() => { vi.resetModules(); sessionStorage.clear() })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('shares one initial session across concurrent requests and follows login rotation', async () => {
    const fetch = vi.fn(async path => {
      if (path === '/api/csrf') return response({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }, 'guest')
      if (path === '/api/auth/login') return response({ user: { id: 'host' } }, 'authenticated')
      return response({ ok: true }, null)
    })
    vi.stubGlobal('fetch', fetch)
    const { api, getSessionToken } = await import('./api')

    await Promise.all([api('/api/rooms'), api('/api/auth/me')])
    expect(fetch.mock.calls.filter(([path]) => path === '/api/csrf')).toHaveLength(1)
    expect(fetch.mock.calls.find(([path]) => path === '/api/rooms')[1].headers['X-Auth-Token']).toBe('guest')
    await api('/api/auth/login', { method: 'POST', body: { username: 'host', password: 'example' } })
    expect(getSessionToken()).toBe('authenticated')
    await api('/api/auth/me')
    expect(fetch.mock.calls.at(-1)[1].headers['X-Auth-Token']).toBe('authenticated')
  })
})
