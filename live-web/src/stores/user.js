import { defineStore } from 'pinia'
import { api, resetCsrf } from '../api'

let loadRequest = null, sessionRevision = 0
export const useUser = defineStore('user', {
  state: () => ({ current: null, ready: false, loadError: '', authOpen: false, afterAuth: null }),
  actions: {
    async load() {
      if (loadRequest) return loadRequest
      const revision = sessionRevision
      loadRequest = (async () => {
        try { const result = await api('/api/auth/me'); if (revision === sessionRevision) { this.current = result.authenticated ? result.user : null; this.loadError = '' } }
        catch (error) { if (revision === sessionRevision) { this.current = null; this.loadError = error.message } }
        finally { if (revision === sessionRevision) this.ready = true }
      })()
      try { await loadRequest } finally { loadRequest = null }
    },
    async authenticate(mode, values) {
      const result = await api(`/api/auth/${mode}`, { method: 'POST', body: values })
      const next = this.afterAuth
      sessionRevision++; this.afterAuth = null; this.current = result.user; this.ready = true; this.loadError = ''; this.authOpen = false
      if (next) await next()
    },
    async logout() { await api('/api/auth/logout', { method: 'POST' }); sessionRevision++; resetCsrf(); this.current = null },
    openAuth(next = null) { this.afterAuth = next; this.authOpen = true },
    closeAuth() { this.afterAuth = null; this.authOpen = false },
    require(next = null) { if (this.current) return true; this.openAuth(next); return false },
  },
})
