// @vitest-environment jsdom
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { useSpeakerActivity } from './useSpeakerActivity'

afterEach(() => vi.useRealTimers())
it('keeps the ring through short pauses and highlights the latest speaker', async () => {
  vi.useFakeTimers()
  let activity
  const wrapper = mount(defineComponent({ setup() { activity=useSpeakerActivity(); return () => h('div') } }))
  activity.update(['a']); expect(activity.active.value.has('a')).toBe(true)
  activity.update([]); vi.advanceTimersByTime(300)
  activity.update(['a', 'b']); expect(activity.recent.value).toBe('b')
  vi.advanceTimersByTime(150); expect(activity.active.value.has('a')).toBe(true)
  activity.update(['b']); vi.advanceTimersByTime(399); expect(activity.active.value.has('a')).toBe(true)
  vi.advanceTimersByTime(1); await nextTick(); expect(activity.active.value.has('a')).toBe(false)
  wrapper.unmount(); expect(vi.getTimerCount()).toBe(0)
})
