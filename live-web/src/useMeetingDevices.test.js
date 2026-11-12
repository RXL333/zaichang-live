// @vitest-environment jsdom
import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { useMeetingDevices } from './useMeetingDevices'

afterEach(()=>{delete navigator.mediaDevices;localStorage.clear()})

it('switches the selected microphone and falls back when it is unplugged',async()=>{
  let onChange
  const list=vi.fn()
    .mockResolvedValueOnce([{kind:'audioinput',deviceId:'default',label:'默认'}, {kind:'audioinput',deviceId:'mic-1',label:'外接麦克风'}])
    .mockResolvedValue([{kind:'audioinput',deviceId:'default',label:'默认'}])
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{enumerateDevices:list,addEventListener:(_name,fn)=>{onChange=fn},removeEventListener:vi.fn()}})
  const switchActiveDevice=vi.fn(async()=>true),notify=vi.fn()
  let controls
  const Harness=defineComponent({setup(){controls=useMeetingDevices({room:ref({switchActiveDevice}),mediaState:ref('connected'),notify,initial:{}});return()=>null}})
  const wrapper=mount(Harness)
  await flushPromises()
  expect(await controls.choose('audioinput','mic-1')).toBe(true)
  expect(switchActiveDevice).toHaveBeenCalledWith('audioinput','mic-1',true)
  onChange();await flushPromises()
  expect(switchActiveDevice).toHaveBeenCalledWith('audioinput','default',false)
  expect(controls.selected.microphoneId).toBe('')
  expect(notify).toHaveBeenCalledWith('麦克风已断开，已切换到可用设备。')
  wrapper.unmount()
})
