// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '../api'
import { useUser } from '../stores/user'
import HomeView from './HomeView.vue'

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../api', () => ({ api: vi.fn(), resetCsrf: vi.fn() }))

describe('discover and following', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('invites an anonymous visitor to sign in rather than reporting a network error', async () => {
    const user = useUser(); user.ready = true
    const wrapper = mount(HomeView, { props: { following: true }, global: { stubs: { RouterLink: true, EmptyArt: true, RoomCard: true } } })
    await flushPromises()
    expect(wrapper.text()).toContain('登录后查看关注')
    expect(wrapper.text()).not.toContain('暂时没连上')
    expect(api).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the latest category results when an older request finishes later', async () => {
    const user = useUser(); user.ready = true
    let finishFirst
    api.mockImplementation(path => path.includes('category=')
      ? Promise.resolve([{ id: 'new', title: '音乐现场', status: 'LIVE' }])
      : new Promise(resolve => { finishFirst = resolve }))
    const wrapper = mount(HomeView, { global: { stubs: { RouterLink: true, EmptyArt: true, RoomCard: { props: ['room'], template: '<div>{{ room.title }}</div>' } } } })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '音乐').trigger('click')
    await flushPromises()
    finishFirst([{ id: 'old', title: '旧结果', status: 'LIVE' }])
    await flushPromises()
    expect(wrapper.text()).toContain('音乐现场')
    expect(wrapper.text()).not.toContain('旧结果')
    wrapper.unmount()
  })
})
