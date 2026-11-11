import { apiOrigin, getSessionToken } from './api'

export function createMeetingSocket({ number, onEvent, onState, onJoined }) {
  let socket, timer, heartbeat, attempt=0, stopped=false, joined=false
  const state=value=>onState?.(value)
  function send(value){if(socket?.readyState!==WebSocket.OPEN || !joined)return false;socket.send(JSON.stringify(value));return true}
  function connect(){
    if(stopped)return
    state(attempt?'reconnecting':'connecting')
    const url=new URL('/ws/meetings',apiOrigin || `${location.protocol}//${location.host}`)
    url.protocol=url.protocol==='https:'?'wss:':'ws:'
    socket=new WebSocket(url.href)
    socket.onopen=()=>{socket.send(JSON.stringify({type:'JOIN',number,authToken:getSessionToken()||''}))}
    socket.onmessage=event=>{
      let data;try{data=JSON.parse(event.data)}catch{return}
      if(data.type==='JOINED'){
        joined=true;attempt=0;state('connected');clearInterval(heartbeat)
        heartbeat=setInterval(()=>send({type:'PING'}),25000);onJoined?.()
      }
      if(data.type==='KICKED' || data.type==='ENDED'){stopped=true;clearTimeout(timer);clearInterval(heartbeat)}
      if(data.type==='ERROR' && !joined && [401,403,404,409].includes(data.code)){stopped=true;state('expired')}
      onEvent?.(data)
    }
    socket.onclose=()=>{joined=false;clearInterval(heartbeat);if(stopped){state('closed');return}state('reconnecting');timer=setTimeout(connect,Math.min(1000*2**attempt++,15000)+Math.random()*400)}
    socket.onerror=()=>socket.close()
  }
  function close(){stopped=true;joined=false;clearTimeout(timer);clearInterval(heartbeat);socket?.close();state('closed')}
  connect();return {send,close}
}
