import { defineStore } from 'pinia'
import { apiOrigin } from '../api'

const deadlineMs = 90_000
const requestTimeoutMs = 8_000
const delays = [2_000, 4_000, 8_000, 12_000, 20_000]

// One bounded wake-up sequence per page load or explicit retry.
export const useServiceHealth = defineStore('serviceHealth', {
  state: () => ({ status: 'idle' }),
  actions: {
    start() {
      if (this.pending) return this.pending
      if (this.status === 'ready') return Promise.resolve(true)
      const started = Date.now()
      this.status = 'checking'
      this.pending = (async () => {
        for (let attempt = 0; Date.now() - started < deadlineMs; attempt++) {
          const controller = new AbortController()
          const remaining = deadlineMs - (Date.now() - started)
          const timer = setTimeout(() => controller.abort(), Math.min(requestTimeoutMs, remaining))
          try {
            const response = await fetch(`${apiOrigin}/api/system/status`, {
              cache: 'no-store', credentials: 'omit', signal: controller.signal,
            })
            if (response.ok && (await response.json()).status === 'OK') {
              this.status = 'ready'
              return true
            }
          } catch { /* The service can be asleep or temporarily unreachable. */ }
          finally { clearTimeout(timer) }
          this.status = 'starting'
          const remainingAfterRequest = deadlineMs - (Date.now() - started)
          if (remainingAfterRequest <= 0) break
          await new Promise(resolve => setTimeout(resolve, Math.min(delays[Math.min(attempt, delays.length - 1)], remainingAfterRequest)))
        }
        this.status = 'timeout'
        return false
      })().finally(() => { this.pending = null })
      return this.pending
    },
  },
})
