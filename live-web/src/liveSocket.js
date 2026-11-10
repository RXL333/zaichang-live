import { apiOrigin, getSessionToken } from './api'

export function createLiveSocket({ roomId, sessionId, onMessage, onStateChange }) {
  let socket, timer, heartbeat, attempt = 0, stopped = false, pausedUntil = 0
  const setState = (state) => onStateChange?.(state)
  const send = (message) => {
    if (socket?.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message)); return true
  }
  function connect() {
    if (stopped) return
    setState(attempt ? 'reconnecting' : 'connecting')
    const url = new URL('/ws/live', apiOrigin || `${location.protocol}//${location.host}`)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(url.href)
    socket.onopen = () => {
      const authToken = getSessionToken()
      attempt = 0; setState('connected'); send({ type: 'JOIN', roomId, sessionId: sessionId || '', ...(authToken ? { authToken } : {}) })
      heartbeat = setInterval(() => send({ type: 'PING' }), 25000)
    }
    socket.onmessage = (event) => { try { onMessage?.(JSON.parse(event.data)) } catch { /* Ignore malformed messages. */ } }
    socket.onclose = () => {
      clearInterval(heartbeat)
      if (stopped) { setState('closed'); return }
      setState('reconnecting')
      timer = setTimeout(connect, Math.max(pausedUntil - Date.now(), Math.min(1000 * 2 ** attempt++, 15000) + Math.random() * 400))
    }
    socket.onerror = () => socket.close()
  }
  function close() { stopped = true; clearTimeout(timer); clearInterval(heartbeat); socket?.close() }
  function reconnectForDemo() { pausedUntil = Date.now() + 10000; socket?.close() }
  connect()
  return { send, close, reconnectForDemo }
}
