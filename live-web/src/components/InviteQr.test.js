// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import InviteQr from './InviteQr.vue'

it('generates a local QR image without requesting an external service', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const wrapper = mount(InviteQr, { props: { value:'https://example.org/#/join/123456789' } })
  expect(wrapper.get('svg').attributes('aria-label')).toBe('会议邀请二维码')
  expect(wrapper.get('path').attributes('d').length).toBeGreaterThan(100)
  expect(fetch).not.toHaveBeenCalled()
  wrapper.unmount(); vi.unstubAllGlobals()
})
