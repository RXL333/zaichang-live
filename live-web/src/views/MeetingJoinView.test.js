// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MeetingJoinView from './MeetingJoinView.vue'
import { api } from '../api'
import { useServiceHealth } from '../stores/serviceHealth'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { number: '123456789' } }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../api', () => ({ api: vi.fn(), resetCsrf: vi.fn() }))

beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

it('waits for the service, then looks up the meeting automatically', async () => {
  const service = useServiceHealth()
  service.status = 'starting'
  api.mockResolvedValue({ title: '项目会议', ownerName: '主持人', status: 'OPEN' })
  const wrapper = mount(MeetingJoinView, { global: { stubs: { RouterLink: true } } })
  expect(wrapper.text()).toContain('会议服务正在启动')
  expect(api).not.toHaveBeenCalled()
  service.status = 'ready'
  await vi.waitFor(() => expect(wrapper.text()).toContain('确认参会信息'))
  expect(api).toHaveBeenCalledWith('/api/meetings/123456789')
  wrapper.unmount()
})
