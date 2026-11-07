// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { api } from '../api'
import { useUser } from '../stores/user'
import AccountDialog from './AccountDialog.vue'

vi.mock('../api', () => ({ api: vi.fn(), resetCsrf: vi.fn() }))

describe('account dialog', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('checks the confirmation password before registering', async () => {
    const user = useUser()
    const wrapper = mount(AccountDialog, { global: { stubs: { teleport: true } } })
    user.openAuth()
    await nextTick()
    await wrapper.findAll('button').find(button => button.text() === '注册账号').trigger('click')
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('example_user')
    await inputs[1].setValue('观众')
    await inputs[2].setValue('password123')
    await inputs[3].setValue('different123')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('两次输入的密码不一致')
    expect(api).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
