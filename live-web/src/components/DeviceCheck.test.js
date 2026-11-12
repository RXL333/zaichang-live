// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import DeviceCheck from './DeviceCheck.vue'

let videoTrack, audioTrack, getUserMedia, mediaDevices
beforeEach(() => {
  videoTrack={ stop:vi.fn() }; audioTrack={ stop:vi.fn() }
  getUserMedia=vi.fn(async constraints => ({ getTracks:()=>[constraints.video ? videoTrack : audioTrack] }))
  mediaDevices={ getUserMedia, enumerateDevices:vi.fn(async()=>[]), addEventListener:vi.fn(), removeEventListener:vi.fn() }
  Object.defineProperty(navigator,'mediaDevices',{ configurable:true,value:mediaDevices })
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue()
  localStorage.clear()
})
afterEach(() => { vi.restoreAllMocks(); delete navigator.mediaDevices })

it('requests no permissions until the user checks, then releases both preview tracks', async () => {
  const wrapper=mount(DeviceCheck)
  expect(getUserMedia).not.toHaveBeenCalled()
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(getUserMedia).toHaveBeenCalledTimes(2)
  expect(wrapper.find('video').element.srcObject).toBeTruthy()
  wrapper.vm.release()
  expect(videoTrack.stop).toHaveBeenCalledTimes(1)
  expect(audioTrack.stop).toHaveBeenCalledTimes(1)
  wrapper.unmount()
  expect(mediaDevices.removeEventListener).toHaveBeenCalledWith('devicechange',expect.any(Function))
})

it('stops a permission request that resolves after leaving the page', async () => {
  let resolveVideo
  getUserMedia.mockImplementation(constraints => constraints.video
    ? new Promise(resolve=>{resolveVideo=resolve})
    : Promise.resolve({getTracks:()=>[audioTrack]}))
  const wrapper=mount(DeviceCheck)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  wrapper.unmount()
  resolveVideo({getTracks:()=>[videoTrack]})
  await flushPromises()
  expect(videoTrack.stop).toHaveBeenCalledTimes(1)
  expect(audioTrack.stop).toHaveBeenCalledTimes(1)
})
