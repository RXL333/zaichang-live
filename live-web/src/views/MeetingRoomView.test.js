// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '../api'
import { useUser } from '../stores/user'
import MeetingRoomView from './MeetingRoomView.vue'

const socketMock = vi.hoisted(() => ({ onEvent: null, send: vi.fn(() => true), close: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { number: '123456789' } }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('../api', () => ({ api: vi.fn(), resetCsrf: vi.fn() }))
vi.mock('../meetingSocket', () => ({ createMeetingSocket: ({ onState, onEvent }) => {
  socketMock.onEvent = onEvent; onState('connected'); return { send: socketMock.send, close: socketMock.close }
} }))
vi.mock('livekit-client', () => ({
  Room: class {
    constructor() { this.localParticipant = { isCameraEnabled: false, isMicrophoneEnabled: false, isScreenShareEnabled: false }; this.remoteParticipants = new Map() }
    on() {} async connect() {} async disconnect() {}
  },
  RoomEvent: {}, Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } },
}))

beforeEach(() => {
  setActivePinia(createPinia()); vi.clearAllMocks()
  const user = useUser(); user.current = { id: 'user-1', nickname: '小林' }; user.ready = true
  api.mockImplementation(path => {
    if (path === '/api/auth/me') return Promise.resolve({ authenticated: true, user: { id: 'user-1', nickname: '小林' } })
    if (path.endsWith('/state')) return Promise.resolve({ title: '项目会议', nickname: '小林', isOwner: true })
    if (path.endsWith('/media-token')) return Promise.resolve({ url: 'wss://example.invalid', token: 'test' })
    return Promise.resolve([])
  })
})

it('keeps a rate-limited chat message visible with a clear failed state', async () => {
  const wrapper = mount(MeetingRoomView, { global: { stubs: { MeetingMedia: true, LogoMark: true } } })
  await vi.waitFor(() => expect(wrapper.text()).toContain('项目会议'))
  await wrapper.findAll('[role="tab"]').find(tab => tab.text().includes('聊天')).trigger('click')
  await wrapper.get('input[aria-label="会议消息"]').setValue('重要消息')
  await wrapper.get('.conference-chat-form').trigger('submit')
  expect(wrapper.text()).toContain('发送中')
  socketMock.onEvent({ type: 'ERROR', code: 429, message: '发送消息过于频繁，请稍后再试' })
  await wrapper.vm.$nextTick()
  expect(wrapper.text()).toContain('重要消息')
  expect(wrapper.text()).toContain('未发送，请稍后复制重试')
  wrapper.unmount()
})
