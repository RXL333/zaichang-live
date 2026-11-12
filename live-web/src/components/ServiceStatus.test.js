// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useServiceHealth } from '../stores/serviceHealth'
import ServiceStatus from './ServiceStatus.vue'

it('shows useful wake-up and timeout states without a raw network error', async () => {
  setActivePinia(createPinia())
  const service = useServiceHealth()
  service.status = 'starting'
  const wrapper = mount(ServiceStatus)
  expect(wrapper.text()).toContain('会议服务正在启动')
  expect(wrapper.text()).not.toContain('Failed to fetch')
  service.status = 'timeout'
  await wrapper.vm.$nextTick()
  expect(wrapper.text()).toContain('重试')
  expect(wrapper.text()).toContain('使用说明')
  service.status = 'ready'
  await wrapper.vm.$nextTick()
  expect(wrapper.text()).toBe('')
  wrapper.unmount()
})
