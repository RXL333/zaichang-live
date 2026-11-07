// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MediaStage from './MediaStage.vue'

describe('live stage status', () => {
  it('distinguishes a connected audio-only stream from a connection in progress', async () => {
    const wrapper = mount(MediaStage, { props: { status: 'LIVE', mediaState: 'connected' } })
    expect(wrapper.text()).toContain('主播暂未开启画面')
    await wrapper.setProps({ mediaState: 'connecting' })
    expect(wrapper.text()).toContain('正在连接直播画面')
    wrapper.unmount()
  })
})
