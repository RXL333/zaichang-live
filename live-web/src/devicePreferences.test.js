// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { loadDevicePreferences, saveDevicePreferences, useJoinDevices } from './devicePreferences'

afterEach(()=>vi.unstubAllGlobals())
it('keeps the opt-in for only the intended meeting and consumes it once',()=>{
  setActivePinia(createPinia())
  const state=useJoinDevices()
  state.prepare('123456789',{microphoneOn:true,cameraOn:false})
  expect(state.consume('123456789').microphoneOn).toBe(true)
  expect(state.consume('123456789')).toBeNull()
  state.prepare('123456789',{cameraOn:true})
  expect(state.consume('987654321')).toBeNull()
})
it('continues without persistent storage when the browser blocks it',()=>{
  vi.stubGlobal('localStorage',{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}})
  expect(loadDevicePreferences().cameraId).toBe('')
  expect(()=>saveDevicePreferences({cameraId:'camera'})).not.toThrow()
})
