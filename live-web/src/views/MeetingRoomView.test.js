// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '../api'
import { useUser } from '../stores/user'
import { useJoinDevices } from '../devicePreferences'
import MeetingRoomView from './MeetingRoomView.vue'

const socketMock = vi.hoisted(() => ({ onEvent: null, onState:null, rooms:[], send: vi.fn(() => true), close: vi.fn(), connect:vi.fn(async()=>{}), microphone:vi.fn(async()=>{}), camera:vi.fn(async()=>{}) }))
const routePush=vi.hoisted(()=>vi.fn())
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { number: '123456789' } }), useRouter: () => ({ push: routePush, replace: vi.fn() }) }))
vi.mock('../api', () => ({ api: vi.fn(), resetCsrf: vi.fn() }))
vi.mock('../meetingSocket', () => ({ createMeetingSocket: ({ onState, onEvent }) => {
  socketMock.onEvent = onEvent; socketMock.onState=onState; onState('connected'); return { send: socketMock.send, close: socketMock.close }
} }))
vi.mock('livekit-client', () => ({
  Room: class {
    constructor() {
      this.handlers=new Map();this.remoteParticipants = new Map()
      this.localParticipant = { isCameraEnabled:false,isMicrophoneEnabled:false,isScreenShareEnabled:false,trackPublications:new Map(),
        setMicrophoneEnabled:async value=>{await socketMock.microphone(value);this.localParticipant.isMicrophoneEnabled=value},
        setCameraEnabled:async value=>{await socketMock.camera(value);this.localParticipant.isCameraEnabled=value} }
      socketMock.rooms.push(this)
    }
    on(event,fn) { const callbacks=this.handlers.get(event) || [];callbacks.push(fn);this.handlers.set(event,callbacks) }
    emit(event,...args) { for(const fn of this.handlers.get(event) || [])fn(...args) }
    connect() { return socketMock.connect() } async disconnect() {}
  },
  RoomEvent: { Reconnecting:'reconnecting',Reconnected:'reconnected',Disconnected:'disconnected',ConnectionQualityChanged:'quality',TrackSubscribed:'subscribed' }, Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } },
}))

beforeEach(() => {
  setActivePinia(createPinia()); vi.clearAllMocks();socketMock.rooms.length=0;socketMock.connect.mockResolvedValue();socketMock.microphone.mockResolvedValue();socketMock.camera.mockResolvedValue()
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

it('opens and closes the mobile interaction drawer and explains unsupported sharing', async () => {
  const wrapper=mount(MeetingRoomView,{attachTo:document.body,global:{stubs:{MeetingMedia:true,LogoMark:true}}})
  await vi.waitFor(()=>expect(wrapper.text()).toContain('项目会议'))
  expect(wrapper.find('[aria-label="共享屏幕"]').exists()).toBe(false)
  await wrapper.get('[aria-label="更多会议功能"]').trigger('click')
  expect(wrapper.text()).toContain('当前浏览器不支持屏幕共享')
  await wrapper.findAll('.mobile-more-menu button').find(button=>button.text().includes('聊天')).trigger('click')
  expect(wrapper.get('#meeting-side').classes()).toContain('mobile-open')
  expect(wrapper.find('input[aria-label="会议消息"]').exists()).toBe(true)
  await wrapper.get('.drawer-handle').trigger('click')
  expect(wrapper.get('#meeting-side').classes()).not.toContain('mobile-open')
  await wrapper.vm.$nextTick()
  expect(document.activeElement).toBe(wrapper.get('[aria-label="更多会议功能"]').element)
  wrapper.unmount()
})

it('restores a previously enabled microphone after a full media reconnect',async()=>{
  useJoinDevices().prepare('123456789',{microphoneOn:true,cameraOn:false})
  const wrapper=mount(MeetingRoomView,{global:{stubs:{MeetingMedia:true,LogoMark:true}}})
  await vi.waitFor(()=>expect(socketMock.microphone).toHaveBeenCalledTimes(1))
  await vi.waitFor(()=>expect(wrapper.find('[aria-label="关闭麦克风"]').exists()).toBe(true))
  socketMock.rooms[0].emit('disconnected');await wrapper.vm.$nextTick()
  await wrapper.findAll('button').find(button=>button.text()==='重新连接').trigger('click')
  await vi.waitFor(()=>expect(socketMock.microphone).toHaveBeenCalledTimes(2))
  expect(socketMock.microphone).toHaveBeenLastCalledWith(true)
  wrapper.unmount()
})

it('does not override a host mute received while a microphone is starting',async()=>{
  let finishMicrophone
  socketMock.microphone.mockImplementation(value=>value ? new Promise(resolve=>{finishMicrophone=resolve}) : Promise.resolve())
  useJoinDevices().prepare('123456789',{microphoneOn:true,cameraOn:false})
  const wrapper=mount(MeetingRoomView,{global:{stubs:{MeetingMedia:true,LogoMark:true}}})
  await vi.waitFor(()=>expect(socketMock.microphone).toHaveBeenCalledWith(true))
  socketMock.onEvent({type:'MUTED',message:'主持人已将你静音'})
  finishMicrophone();await flushPromises()
  expect(socketMock.microphone).toHaveBeenLastCalledWith(false)
  wrapper.unmount()
})

it('gives a non-blocking notification when the host mutes the microphone',async()=>{
  const wrapper=mount(MeetingRoomView,{global:{stubs:{MeetingMedia:true,LogoMark:true}}})
  await vi.waitFor(()=>expect(wrapper.find('[aria-label="开启麦克风"]').exists()).toBe(true))
  socketMock.onEvent({type:'MUTED',message:'主持人已将你静音'})
  await wrapper.vm.$nextTick();await wrapper.vm.$nextTick()
  expect(wrapper.text()).toContain('主持人已将你静音')
  expect(wrapper.get('[aria-label="开启麦克风"]').classes()).toContain('mute-feedback')
  expect(wrapper.get('[aria-label="开启麦克风"]').element.disabled).toBe(false)
  wrapper.unmount()
})

it('opens the ended page when the host ends the meeting',async()=>{
  const wrapper=mount(MeetingRoomView,{global:{stubs:{MeetingMedia:true,LogoMark:true}}})
  await vi.waitFor(()=>expect(wrapper.text()).toContain('项目会议'))
  socketMock.onEvent({type:'ENDED',message:'会议已结束'})
  expect(routePush).toHaveBeenCalledWith(expect.objectContaining({path:'/ended/123456789',state:expect.objectContaining({meetingEnded:true,meetingTitle:'项目会议'})}))
  wrapper.unmount()
})

it('turns off a camera request that finishes after removal from the meeting',async()=>{
  let finishCamera
  socketMock.camera.mockImplementation(value=>value ? new Promise(resolve=>{finishCamera=resolve}) : Promise.resolve())
  const wrapper=mount(MeetingRoomView,{global:{stubs:{MeetingMedia:true,LogoMark:true}}})
  await vi.waitFor(()=>expect(wrapper.find('[aria-label="开启摄像头"]').exists()).toBe(true))
  await wrapper.get('[aria-label="开启摄像头"]').trigger('click')
  await vi.waitFor(()=>expect(socketMock.camera).toHaveBeenCalledWith(true))
  socketMock.onEvent({type:'KICKED',message:'主持人已将你移出会议'})
  finishCamera();await flushPromises()
  expect(socketMock.camera).toHaveBeenLastCalledWith(false)
  wrapper.unmount()
})
