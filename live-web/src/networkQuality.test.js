import { Track, VideoQuality } from 'livekit-client'
import { expect, it, vi } from 'vitest'
import { adjustVideoQuality, connectionQualityLabel } from './networkQuality'

it('reports actual connection quality and requests lower or restored video quality',()=>{
  expect(['excellent','good','poor','unknown'].map(connectionQualityLabel)).toEqual(['好','一般','差','未知'])
  const setVideoQuality=vi.fn()
  const room={remoteParticipants:new Map([['p',{trackPublications:new Map([['v',{kind:Track.Kind.Video,track:{},setVideoQuality}]])}]])}
  expect(adjustVideoQuality(room,true)).toBe(true)
  expect(setVideoQuality).toHaveBeenLastCalledWith(VideoQuality.LOW)
  adjustVideoQuality(room,false)
  expect(setVideoQuality).toHaveBeenLastCalledWith(VideoQuality.HIGH)
  expect(adjustVideoQuality({remoteParticipants:new Map()},true)).toBe(false)
})
