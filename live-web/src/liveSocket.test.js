import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLiveSocket } from './liveSocket'

class FakeSocket {
  static OPEN = 1
  static instances = []
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeSocket.instances.push(this) }
  send(value) { this.sent.push(JSON.parse(value)) }
  open() { this.readyState = 1; this.onopen?.() }
  receive(value) { this.onmessage?.({ data: value }) }
  close() { this.readyState = 3; this.onclose?.() }
}

describe('room connection', () => {
  beforeEach(() => { vi.useFakeTimers(); FakeSocket.instances = []; vi.stubGlobal('WebSocket', FakeSocket); vi.stubGlobal('location', { protocol: 'https:', host: 'example.test' }); vi.spyOn(Math, 'random').mockReturnValue(0) })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('joins the requested room, dispatches messages and reconnects after a close', () => {
    const messages = [], states = []
    const live = createLiveSocket({ roomId: 'room-a', sessionId: 'session-a', onMessage: m => messages.push(m), onStateChange: s => states.push(s) })
    const first = FakeSocket.instances[0]
    expect(first.url).toBe('wss://example.test/ws/live')
    first.open()
    expect(first.sent[0]).toEqual({ type: 'JOIN', roomId: 'room-a', sessionId: 'session-a' })
    first.receive('{"type":"DANMAKU","content":"你好"}')
    first.receive('not-json')
    expect(messages).toEqual([{ type: 'DANMAKU', content: '你好' }])
    first.close(); vi.advanceTimersByTime(1000)
    expect(FakeSocket.instances).toHaveLength(2)
    FakeSocket.instances[1].open()
    expect(FakeSocket.instances[1].sent[0].type).toBe('JOIN')
    expect(states).toContain('reconnecting')
    live.close(); vi.advanceTimersByTime(20000)
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('keeps the deliberate network experiment disconnected for ten seconds', () => {
    const live = createLiveSocket({ roomId: 'room-a', sessionId: 'session-a' })
    FakeSocket.instances[0].open(); live.reconnectForDemo()
    vi.advanceTimersByTime(9999); expect(FakeSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1); expect(FakeSocket.instances).toHaveLength(2)
    live.close()
  })
})
