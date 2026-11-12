// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useServiceHealth } from './serviceHealth'

describe('service wake-up', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('retries a failed health check and stops after the service recovers', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'OK' }) })
    vi.stubGlobal('fetch', fetch)
    const service = useServiceHealth()
    const result = service.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(service.status).toBe('starting')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await result).toBe(true)
    expect(service.status).toBe('ready')
    await vi.advanceTimersByTimeAsync(100_000)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('stops after the deadline and allows a user-initiated retry', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetch)
    const service = useServiceHealth()
    const first = service.start()
    await vi.advanceTimersByTimeAsync(90_000)
    expect(await first).toBe(false)
    expect(service.status).toBe('timeout')
    const count = fetch.mock.calls.length
    await vi.advanceTimersByTimeAsync(100_000)
    expect(fetch).toHaveBeenCalledTimes(count)
    fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'OK' }) })
    expect(await service.start()).toBe(true)
    expect(service.status).toBe('ready')
  })
})
