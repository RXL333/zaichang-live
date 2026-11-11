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
    handlers.get(RoomEvent.ActiveSpeakersChanged)?.([])
    await nextTick()
    expect(wrapper.find('.conference-tile').classes()).toContain('speaking')
    expect(audio.attach).toHaveBeenCalledTimes(1)
    expect(audio.detach).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(audio.detach).toHaveBeenCalledTimes(1)
  })
})
