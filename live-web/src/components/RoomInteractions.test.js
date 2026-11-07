// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { createLiveSocket } from '../liveSocket'
import { api } from '../api'
import { useUser } from '../stores/user'
import RoomInteractions from './RoomInteractions.vue'

vi.mock('../api', () => ({ api: vi.fn(), resetCsrf: vi.fn() }))
vi.mock('../liveSocket', () => ({ createLiveSocket: vi.fn(() => ({ send: vi.fn(() => true), close: vi.fn() })) }))

describe('live interactions', () => {
  let wrapper
  beforeEach(() => {
    vi.clearAllMocks(); setActivePinia(createPinia())
    const user = useUser(); user.current = { id: 'viewer', nickname: '观众' }; user.ready = true
    api.mockImplementation(path => path.includes('/messages?') ? Promise.resolve([]) : Promise.resolve({ poll: null, questions: [], micRequests: [] }))
    wrapper = mount(RoomInteractions, { props: { roomId: 'room', sessionId: 'session-1' } })
  })
  afterEach(() => { wrapper?.unmount() })

  it('preserves the reading position and lets viewers jump to new messages', async () => {
    const options = createLiveSocket.mock.calls[0][0]
    const content = wrapper.get('.chat-content')
    Object.defineProperties(content.element, {
      scrollHeight: { value: 600, configurable: true },
      clientHeight: { value: 200, configurable: true },
      scrollTop: { value: 0, writable: true, configurable: true },
    })
    await content.trigger('scroll')
    options.onMessage({ type: 'DANMAKU', sessionId: 'session-1', id: 'one', seq: 1, userId: 'someone', nickname: '主播', content: '新消息' })
    await nextTick()
    expect(content.element.scrollTop).toBe(0)
    expect(wrapper.get('.chat-update').text()).toContain('1 条新消息')
    await wrapper.get('.chat-update button').trigger('click')
    await nextTick()
    expect(content.element.scrollTop).toBe(600)
    expect(wrapper.find('.chat-update').exists()).toBe(false)
    options.onMessage({ type: 'DANMAKU', sessionId: 'session-1', id: 'two', seq: 2, userId: 'someone', nickname: '主播', content: '继续' })
    await nextTick()
    expect(wrapper.find('.chat-update').exists()).toBe(false)
  })

  it('discards a delayed interaction snapshot from a previous session', async () => {
    let finishOld
    api.mockImplementation(path => {
      if (path === '/api/sessions/session-1/interactions') return new Promise(resolve => { finishOld = resolve })
      if (path === '/api/sessions/session-2/interactions') return Promise.resolve({ poll: { id: 'new', status: 'OPEN', question: '当前投票', options: [] }, questions: [], micRequests: [] })
      return Promise.resolve([])
    })
    createLiveSocket.mock.calls[0][0].onMessage({ type: 'SYSTEM', roomId: 'room' })
    await nextTick()
    await wrapper.setProps({ sessionId: 'session-2' })
    createLiveSocket.mock.calls[1][0].onMessage({ type: 'SYSTEM', roomId: 'room' })
    await flushPromises()
    finishOld({ poll: { id: 'old', status: 'OPEN', question: '过期投票', options: [] }, questions: [], micRequests: [] })
    await flushPromises()
    await wrapper.get('[data-tab="poll"]').trigger('click')
    expect(wrapper.text()).toContain('当前投票')
    expect(wrapper.text()).not.toContain('过期投票')
  })
})
