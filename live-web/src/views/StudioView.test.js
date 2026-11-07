// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { Room, RoomEvent, Track, createLocalScreenTracks } from 'livekit-client'
import { api } from '../api'
import { useUser } from '../stores/user'
import StudioView from './StudioView.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'room-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('../api', () => ({ api: vi.fn(), resetCsrf: vi.fn() }))
vi.mock('livekit-client', () => {
  class FakeRoom {
    static instances = []
    static nextConnect = null
    constructor() {
      this.handlers = {}
      this.localParticipant = { setCameraEnabled: vi.fn().mockResolvedValue(), setMicrophoneEnabled: vi.fn().mockResolvedValue(), isScreenShareEnabled: false }
      this.localParticipant.publishTrack = vi.fn().mockImplementation(async track => { if (track.source === 'screen_share') this.localParticipant.isScreenShareEnabled = true })
      this.connect = FakeRoom.nextConnect || vi.fn().mockResolvedValue()
      this.disconnect = vi.fn().mockResolvedValue()
      FakeRoom.instances.push(this)
    }
    on(event, callback) { this.handlers[event] = callback }
    emit(event, ...args) { this.handlers[event]?.(...args) }
  }
  return { Room: FakeRoom, RoomEvent: { Reconnecting: 'reconnecting', Reconnected: 'reconnected', Disconnected: 'disconnected', LocalTrackUnpublished: 'unpublished' }, Track: { Source: { ScreenShare: 'screen_share' } }, createLocalScreenTracks: vi.fn() }
})

describe('creator studio', () => {
  let wrapper
  beforeEach(() => {
    vi.clearAllMocks(); Room.instances.length = 0; Room.nextConnect = null
    setActivePinia(createPinia())
    const user = useUser(); user.current = { id: 'owner', nickname: '主播' }; user.ready = true
    api.mockImplementation((path) => {
      if (path === '/api/rooms') return Promise.resolve([])
      if (path === '/api/rooms/room-1') return Promise.resolve({ id: 'room-1', ownerId: 'owner', status: 'OFFLINE', title: '测试直播间', category: '聊天', coverStyle: 'tomato' })
      if (path === '/api/rooms/room-1/sessions') return Promise.resolve({ id: 'session-1' })
      if (path === '/api/sessions/session-1/media-token') return Promise.resolve({ url: 'wss://example.test', token: 'test-token' })
      if (path === '/api/sessions/session-1/activate') return Promise.resolve({ status: 'LIVE' })
      throw new Error(`Unexpected request: ${path}`)
    })
    wrapper = mount(StudioView, { global: { stubs: { RouterLink: true, MediaStage: true, RoomInteractions: true, DanmakuLayer: true, ReactionLayer: true } } })
  })
  afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })

  it('can go live with only a microphone and offers recovery after a disconnect', async () => {
    await flushPromises()
    const button = text => wrapper.findAll('button').find(item => item.text() === text)
    await button('摄像头').trigger('click')
    expect(button('摄像头').attributes('aria-pressed')).toBe('false')
    await button('开始直播').trigger('click')
    await flushPromises()
    const connection = Room.instances[0]
    expect(connection.localParticipant.setCameraEnabled).not.toHaveBeenCalled()
    expect(connection.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true)
    expect(api).toHaveBeenCalledWith('/api/sessions/session-1/activate', expect.objectContaining({ method: 'POST' }))
    expect(wrapper.text()).toContain('正在直播')

    connection.emit(RoomEvent.Disconnected)
    await nextTick()
    expect(wrapper.text()).toContain('直播连接已断开')
    expect(wrapper.text()).toContain('重新连接')
    expect(button('开始直播')).toBeTruthy()
  })

  it('previews only the selected device and releases that preview', async () => {
    const stop = vi.fn()
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([]) } })
    await flushPromises()
    await wrapper.findAll('button').find(item => item.text() === '摄像头').trigger('click')
    await wrapper.findAll('.control-button').find(item => item.text() === '检查设备').trigger('click')
    await flushPromises()
    expect(getUserMedia).toHaveBeenCalledWith({ video: false, audio: true })
    expect(wrapper.text()).toContain('麦克风已就绪')
    wrapper.unmount(); wrapper = null
    expect(stop).toHaveBeenCalledOnce()
  })

  it('does not turn on devices if the creator leaves while the connection is pending', async () => {
    let finishConnection
    Room.nextConnect = vi.fn(() => new Promise(resolve => { finishConnection = resolve }))
    await flushPromises()
    await wrapper.findAll('button').find(item => item.text() === '开始直播').trigger('click')
    await flushPromises()
    const connection = Room.instances[0]
    wrapper.unmount(); wrapper = null
    finishConnection()
    await flushPromises()
    expect(connection.disconnect).toHaveBeenCalled()
    expect(connection.localParticipant.setCameraEnabled).not.toHaveBeenCalled()
    expect(connection.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(api).not.toHaveBeenCalledWith('/api/sessions/session-1/activate', expect.anything())
  })

  it('can start with only a screen and obtains consent before creating a session', async () => {
    let finishCapture
    const track = { source: Track.Source.ScreenShare, mediaStreamTrack: { readyState: 'live' }, stop: vi.fn() }
    createLocalScreenTracks.mockImplementation(() => new Promise(resolve => { finishCapture = resolve }))
    await flushPromises()
    const button = text => wrapper.findAll('button').find(item => item.text() === text)
    await button('摄像头').trigger('click')
    await button('麦克风').trigger('click')
    await button('屏幕共享').trigger('click')
    expect(wrapper.text()).toContain('准备共享屏幕')
    await button('开始直播').trigger('click')
    expect(createLocalScreenTracks).toHaveBeenCalledWith({ audio: false })
    expect(api).not.toHaveBeenCalledWith('/api/rooms/room-1/sessions', expect.anything())
    finishCapture([track])
    await flushPromises()
    const connection = Room.instances[0]
    expect(connection.localParticipant.publishTrack).toHaveBeenCalledWith(track, { source: Track.Source.ScreenShare })
    expect(connection.localParticipant.setCameraEnabled).not.toHaveBeenCalled()
    expect(connection.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(api).toHaveBeenCalledWith('/api/sessions/session-1/activate', expect.objectContaining({ method: 'POST' }))
    connection.localParticipant.isScreenShareEnabled = false
    connection.emit(RoomEvent.LocalTrackUnpublished, { source: Track.Source.ScreenShare })
    await nextTick()
    expect(wrapper.text()).toContain('屏幕共享已结束')
    expect(track.stop).toHaveBeenCalledOnce()
    wrapper.unmount(); wrapper = null
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('does not create a session when screen selection is cancelled', async () => {
    createLocalScreenTracks.mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }))
    await flushPromises()
    const button = text => wrapper.findAll('button').find(item => item.text() === text)
    await button('摄像头').trigger('click')
    await button('麦克风').trigger('click')
    await button('屏幕共享').trigger('click')
    await button('开始直播').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('已取消屏幕共享')
    expect(api).not.toHaveBeenCalledWith('/api/rooms/room-1/sessions', expect.anything())
  })

  it('releases a screen selected after the creator has left the studio', async () => {
    let finishCapture
    const track = { source: Track.Source.ScreenShare, mediaStreamTrack: { readyState: 'live' }, stop: vi.fn() }
    createLocalScreenTracks.mockImplementation(() => new Promise(resolve => { finishCapture = resolve }))
    await flushPromises()
    const button = text => wrapper.findAll('button').find(item => item.text() === text)
    await button('屏幕共享').trigger('click')
    await button('开始直播').trigger('click')
    wrapper.unmount(); wrapper = null
    finishCapture([track])
    await flushPromises()
    expect(track.stop).toHaveBeenCalledOnce()
    expect(api).not.toHaveBeenCalledWith('/api/rooms/room-1/sessions', expect.anything())
  })

  it('does not activate a stream whose screen capture has already ended', async () => {
    const track = { source: Track.Source.ScreenShare, mediaStreamTrack: { readyState: 'ended' }, stop: vi.fn() }
    createLocalScreenTracks.mockResolvedValue([track])
    await flushPromises()
    const button = text => wrapper.findAll('button').find(item => item.text() === text)
    await button('屏幕共享').trigger('click')
    await button('开始直播').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('屏幕共享已结束')
    expect(Room.instances[0].localParticipant.publishTrack).not.toHaveBeenCalled()
    expect(api).not.toHaveBeenCalledWith('/api/sessions/session-1/activate', expect.anything())
    expect(track.stop).toHaveBeenCalledOnce()
  })
})
