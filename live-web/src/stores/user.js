import { defineStore } from 'pinia'
import { api, resetCsrf } from '../api'

export const useUser = defineStore('user', {
  state: () => ({ current: null, ready: false, authOpen: false }),
  actions: {
    async load() {
      try { const result = await api('/api/auth/me'); this.current = result.authenticated ? result.user : null }
      catch { this.current = null }
      finally { this.ready = true }
    },
    async authenticate(mode, values) {
      const result = await api(`/api/auth/${mode}`, { method: 'POST', body: values })
      this.current = result.user; this.authOpen = false
    },
    async logout() { await api('/api/auth/logout', { method: 'POST' }); resetCsrf(); this.current = null },
    require() { if (this.current) return true; this.authOpen = true; return false },
  },
})
