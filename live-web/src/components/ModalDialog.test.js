// @vitest-environment jsdom
import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ModalDialog from './ModalDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const Harness = defineComponent({
  components: { ModalDialog },
  setup() { return { open: ref(false) } },
  template: `<div><button id="trigger" @click="open=true">打开</button>
    <ModalDialog :open="open" labelledby="dialog-title" @close="open=false">
      <h2 id="dialog-title">测试</h2><input aria-label="名称"><button id="last">保存</button>
    </ModalDialog></div>`,
})

afterEach(() => { document.body.innerHTML = ''; document.body.style.overflow = '' })

describe('modal keyboard access', () => {
  it('focuses the input, traps Tab, closes on Escape and restores focus and scrolling', async () => {
    const wrapper = mount(Harness, { attachTo: document.body })
    const trigger = wrapper.get('#trigger').element
    trigger.focus()
    await wrapper.get('#trigger').trigger('click')
    await nextTick()
    const dialog = document.querySelector('[role="dialog"]')
    const first = dialog.querySelector('[data-modal-close]'), last = dialog.querySelector('#last')
    expect(document.activeElement).toBe(dialog.querySelector('input'))
    expect(document.body.style.overflow).toBe('hidden')
    last.focus()
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(forward)
    expect(forward.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
    const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    document.dispatchEvent(backward)
    expect(document.activeElement).toBe(last)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick(); await nextTick()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).toBe('')
    wrapper.unmount()
  })

  it('defaults a dangerous confirmation to Cancel', async () => {
    const wrapper = mount(ConfirmDialog, { attachTo: document.body, props: { open: true, title: '删除会议', description: '确认删除？', confirmText: '删除' } })
    await nextTick()
    expect(document.activeElement.textContent).toBe('取消')
    document.querySelector('.destructive').click()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })
})
