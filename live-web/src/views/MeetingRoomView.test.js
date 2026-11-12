// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '../api'
import { useUser } from '../stores/user'
import { useJoinDevices } from '../devicePreferences'
import MeetingRoomView from './MeetingRoomView.vue'

const socketMock = vi.hoisted(() => ({ onEvent: null, onState:null, send: vi.fn(() => true), close: vi.fn(), connect:vi.fn(async()=>{}), microphone:vi.fn(async()=>{}), camera:vi.fn(async()=>{}) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { number: '123456789' } }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('../api', () => ({ api: vi.fn(), resetCsrf: vi.fn() }))
vi.mock('../meetingSocket', () => ({ createMeetingSocket: ({ onState, onEvent }) => {
  socketMock.onEvent = onEvent; socketMock.onState=onState; onState('connected'); return { send: socketMock.send, close: socketMock.close }
} }))
vi.mock('livekit-client', () => ({
  Room: class {
    constructor() { this.localParticipant = { isCameraEnabled: false, isMicrophoneEnabled: false, isScreenShareEnabled: false, setMicrophoneEnabled:socketMock.microphone, setCameraEnabled:socketMock.camera }; this.remoteParticipants = new Map() }
    on() {} connect() { return socketMock.connect() } async disconnect() {}
  },
  RoomEvent: {}, Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } },
}))

beforeEach(() => {
  setActivePinia(createPinia()); vi.clearAllMocks();socketMock.connect.mockResolvedValue()
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
  expect(socketMock.microphone).not.toHaveBeenCalled()
  expect(socketMock.camera).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('only enables a device after an explicit opt-in on the join page', async () => {
  useJoinDevices().prepare('123456789',{microphoneOn:true,cameraOn:false})
  const wrapper=mount(MeetingRoomView,{global:{stubs:{MeetingMedia:true,LogoMark:true}}})
  await vi.waitFor(()=>expect(socketMock.microphone).toHaveBeenCalledWith(true))
  expect(socketMock.camera).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('shows reconnecting status and disables chat until the connection returns', async () => {
  const wrapper=mount(MeetingRoomView,{global:{stubs:{MeetingMedia:true,LogoMark:true}}})
  await vi.waitFor(()=>expect(wrapper.text()).toContain('项目会议'))
  await wrapper.findAll('[role="tab"]').find(tab=>tab.text().includes('聊天')).trigger('click')
  socketMock.onState('reconnecting');await wrapper.vm.$nextTick()
  expect(wrapper.text()).toContain('正在重新连接')
  expect(wrapper.get('input[aria-label="会议消息"]').element.disabled).toBe(true)
  socketMock.onState('connected');await wrapper.vm.$nextTick()
  expect(wrapper.get('input[aria-label="会议消息"]').element.disabled).toBe(false)
  wrapper.unmount()
})

it('does not start opted-in devices if the user is removed while media is connecting', async () => {
  let finishConnect
  socketMock.connect.mockImplementation(()=>new Promise(resolve=>{finishConnect=resolve}))
  useJoinDevices().prepare('123456789',{microphoneOn:true,cameraOn:true})
  const wrapper=mount(MeetingRoomView,{global:{stubs:{MeetingMedia:true,LogoMark:true}}})
  await vi.waitFor(()=>expect(socketMock.connect).toHaveBeenCalled())
  socketMock.onEvent({type:'KICKED',message:'主持人已将你移出会议'})
  finishConnect();await flushPromises()
  expect(wrapper.text()).toContain('主持人已将你移出会议')
  expect(socketMock.microphone).not.toHaveBeenCalled()
  expect(socketMock.camera).not.toHaveBeenCalled()
  wrapper.unmount()
})
