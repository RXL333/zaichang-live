import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '../api'
import { useUser } from './user'

vi.mock('../api', () => ({ api: vi.fn(), resetCsrf: vi.fn() }))

describe('account flow', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('continues the requested action after signing in and cancels it when the dialog closes', async () => {
    const user = useUser(), continueToStudio = vi.fn()
    api.mockResolvedValue({ user: { id: 'owner', nickname: '主播' } })
    expect(user.require(continueToStudio)).toBe(false)
    expect(user.authOpen).toBe(true)
    await user.authenticate('login', { username: 'owner', password: 'password' })
    expect(continueToStudio).toHaveBeenCalledOnce()
    expect(user.current.id).toBe('owner')
    expect(user.authOpen).toBe(false)

    user.current = null
    user.require(continueToStudio)
    user.closeAuth()
    await user.authenticate('login', { username: 'owner', password: 'password' })
    expect(continueToStudio).toHaveBeenCalledOnce()
  })

  it('does not replace a newly signed-in user with an older session check', async () => {
    const user = useUser()
    let completeSessionCheck
    api.mockImplementation(path => path === '/api/auth/me'
      ? new Promise(resolve => { completeSessionCheck = resolve })
      : Promise.resolve({ user: { id: 'owner' } }))
    const pending = user.load()
    await user.authenticate('login', {})
    completeSessionCheck({ authenticated: false })
    await pending
    expect(user.current.id).toBe('owner')
    expect(user.ready).toBe(true)
  })
})
