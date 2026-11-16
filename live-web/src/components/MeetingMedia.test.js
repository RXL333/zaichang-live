// @vitest-environment jsdom
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { RoomEvent, Track } from 'livekit-client'
import { describe, expect, it, vi } from 'vitest'
import MeetingMedia from './MeetingMedia.vue'

describe('meeting media',()=>{
  it('updates the speaking indicator without restarting remote audio',async()=>{
    const handlers=new Map()
    const audio={kind:Track.Kind.Audio,attach:vi.fn(()=>document.createElement('audio')),detach:vi.fn()}
    const remote={identity:'user.other.id',isSpeaking:false,trackPublications:new Map([['a',{kind:Track.Kind.Audio,source:Track.Source.Microphone,isMuted:false,track:audio}]])}
    const room={localParticipant:{identity:'user.me.id',trackPublications:new Map()},remoteParticipants:new Map([['other',remote]]),canPlaybackAudio:true,on:(event,fn)=>handlers.set(event,fn),off:(event)=>handlers.delete(event)}
    const wrapper=mount(MeetingMedia,{props:{room,members:[{userId:'other',nickname:'参会者'}],userId:'me',mediaState:'connected'},global:{stubs:{MediaTile:true}}})
    await nextTick()
    expect(audio.attach).toHaveBeenCalledTimes(1)
    remote.isSpeaking=true
    handlers.get(RoomEvent.ActiveSpeakersChanged)?.([remote])
    await nextTick()
    expect(wrapper.find('.conference-tile').classes()).toContain('speaking')
    expect(wrapper.find('.conference-tile').classes()).toContain('speaking-primary')
    expect(audio.attach).toHaveBeenCalledTimes(1)
    expect(audio.detach).not.toHaveBeenCalled()
    remote.connectionQuality='poor'
    handlers.get(RoomEvent.ConnectionQualityChanged)?.('poor',remote)
    await nextTick()
    expect(wrapper.get('[aria-label="连接质量：差"]').exists()).toBe(true)
    expect(audio.detach).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(audio.detach).toHaveBeenCalledTimes(1)
  })
  it('paginates twelve people and keeps video elements mounted when layouts change',async()=>{
    const handlers=new Map(),members=[],participants=[]
    for(let i=0;i<12;i++){
      const track={kind:Track.Kind.Video,attach:vi.fn(),detach:vi.fn()}
      members.push({userId:`u${i}`,nickname:`成员${i}`})
      participants.push({identity:`user.u${i}.session`,isSpeaking:i===0,trackPublications:new Map([['camera',{kind:Track.Kind.Video,source:Track.Source.Camera,isMuted:false,track}]])})
    }
    const room={localParticipant:participants[0],remoteParticipants:new Map(participants.slice(1).map((p,i)=>[String(i),p])),canPlaybackAudio:true,on:(event,fn)=>handlers.set(event,fn),off:(event)=>handlers.delete(event)}
    const wrapper=mount(MeetingMedia,{attachTo:document.body,props:{room,members,userId:'u0',mediaState:'connected'}})
    await nextTick()
    const tiles=()=>wrapper.findAll('.conference-tile')
    const shown=()=>tiles().filter(tile=>tile.isVisible())
    expect(tiles()).toHaveLength(12)
    expect(shown()).toHaveLength(9)
    expect(wrapper.text()).toContain('1 / 2')
    const originalVideo=tiles()[0].get('video').element
    await wrapper.get('[aria-label="下一页画面"]').trigger('click')
    expect(shown()).toHaveLength(3)
    await wrapper.get('[aria-label="固定成员10"]').trigger('click')
    expect(wrapper.get('.tile-primary').text()).toContain('成员10')
    await wrapper.findAll('.stage-views button')[0].trigger('click')
    await wrapper.findAll('.stage-views button')[1].trigger('click')
    expect(wrapper.get('.tile-primary').text()).toContain('成员10')
    expect(tiles()[0].get('video').element).toBe(originalVideo)
    expect(participants[0].trackPublications.get('camera').track.detach).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('automatically focuses a newly shared screen',async()=>{
    const handlers=new Map(),screen={kind:Track.Kind.Video,attach:vi.fn(),detach:vi.fn()}
    const participant={identity:'user.u1.session',trackPublications:new Map()}
    const room={localParticipant:{identity:'user.u0.session',trackPublications:new Map()},remoteParticipants:new Map([['u1',participant]]),canPlaybackAudio:true,on:(event,fn)=>handlers.set(event,fn),off:(event)=>handlers.delete(event)}
    const wrapper=mount(MeetingMedia,{props:{room,members:[{userId:'u0',nickname:'我'},{userId:'u1',nickname:'同事'}],userId:'u0',mediaState:'connected'}})
    await wrapper.get('[aria-label="固定我"]').trigger('click')
    participant.trackPublications.set('screen',{kind:Track.Kind.Video,source:Track.Source.ScreenShare,isMuted:false,track:screen})
    handlers.get(RoomEvent.TrackSubscribed)?.();await nextTick()
    expect(wrapper.findAll('.stage-views button')[1].attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('.tile-primary').text()).toContain('同事的屏幕')
    expect(wrapper.get('[aria-label="取消固定我"]').attributes('aria-pressed')).toBe('true')
    participant.trackPublications.delete('screen');handlers.get(RoomEvent.TrackUnsubscribed)?.();await nextTick()
    expect(wrapper.get('.tile-primary').text()).toContain('我')
    wrapper.unmount()
  })
  it('shows an invitation only while the local member is alone',async()=>{
    const wrapper=mount(MeetingMedia,{props:{members:[{userId:'u0',nickname:'我'}],userId:'u0',meetingNumber:'123456789',mediaState:'connected'}})
    expect(wrapper.text()).toContain('你是第一个到场的人')
    expect(wrapper.text()).toContain('123 456 789')
    await wrapper.get('.alone-card button').trigger('click')
    expect(wrapper.emitted('invite')).toHaveLength(1)
    await wrapper.setProps({members:[{userId:'u0',nickname:'我'},{userId:'u1',nickname:'同事'}]})
    expect(wrapper.find('.alone-card').exists()).toBe(false)
    wrapper.unmount()
  })
})
