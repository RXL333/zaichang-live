// @vitest-environment jsdom
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import MeetingHomeView from './MeetingHomeView.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../api', () => ({ api: vi.fn(), resetCsrf: vi.fn() }))

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete document.hidden })

it('pauses the home carousel in a hidden tab and follows motion changes live', async () => {
  vi.useFakeTimers(); setActivePinia(createPinia())
  let onChange
  const media = { matches:false, addEventListener:vi.fn((_event, callback)=>{onChange=callback}), removeEventListener:vi.fn() }
  vi.stubGlobal('matchMedia', () => media)
  Object.defineProperty(document, 'hidden', { configurable:true, value:false })
  const wrapper = mount(MeetingHomeView)
  expect(vi.getTimerCount()).toBe(1)
  await vi.advanceTimersByTimeAsync(3000)
  const activeName = wrapper.get('.hero-chat b').text()
  Object.defineProperty(document, 'hidden', { configurable:true, value:true })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(vi.getTimerCount()).toBe(0)
  await vi.advanceTimersByTimeAsync(9000)
  expect(wrapper.get('.hero-chat b').text()).toBe(activeName)
  Object.defineProperty(document, 'hidden', { configurable:true, value:false })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(vi.getTimerCount()).toBe(1)
  onChange({ matches:true }); await nextTick()
  expect(vi.getTimerCount()).toBe(0)
  onChange({ matches:false }); await nextTick()
  expect(vi.getTimerCount()).toBe(1)
  wrapper.unmount()
  expect(vi.getTimerCount()).toBe(0)
  expect(media.removeEventListener).toHaveBeenCalled()
})
