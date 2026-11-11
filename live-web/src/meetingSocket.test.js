import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMeetingSocket } from './meetingSocket'

vi.mock('./api',()=>({apiOrigin:'',getSessionToken:()=> 'session-token'}))
class FakeSocket {
  static OPEN=1;static instances=[]
  constructor(url){this.url=url;this.readyState=0;this.sent=[];FakeSocket.instances.push(this)}
  send(value){this.sent.push(JSON.parse(value))}
  open(){this.readyState=1;this.onopen?.()}
  receive(value){this.onmessage?.({data:JSON.stringify(value)})}
  close(){this.readyState=3;this.onclose?.()}
}
describe('meeting connection',()=>{
  beforeEach(()=>{vi.useFakeTimers();FakeSocket.instances=[];vi.stubGlobal('WebSocket',FakeSocket);vi.stubGlobal('location',{protocol:'https:',host:'example.test'});vi.spyOn(Math,'random').mockReturnValue(0)})
  afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()})
  it('rejoins after a disconnect but stops after removal',()=>{
    const states=[],joined=vi.fn(),events=[]
    const connection=createMeetingSocket({number:'123456789',onState:value=>states.push(value),onJoined:joined,onEvent:value=>events.push(value)})
    const first=FakeSocket.instances[0];first.open()
    expect(first.sent[0]).toEqual({type:'JOIN',number:'123456789',authToken:'session-token'})
    first.receive({type:'JOINED'});expect(joined).toHaveBeenCalledTimes(1)
    first.close();vi.advanceTimersByTime(1000)
    const second=FakeSocket.instances[1];second.open();second.receive({type:'JOINED'})
    expect(joined).toHaveBeenCalledTimes(2);expect(states).toContain('reconnecting')
    second.receive({type:'KICKED',message:'已移出'});second.close();vi.advanceTimersByTime(30000)
    expect(FakeSocket.instances).toHaveLength(2);expect(events.at(-1).type).toBe('KICKED')
    connection.close()
  })
})
