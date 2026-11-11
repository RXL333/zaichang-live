// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MeetingHomeView from './MeetingHomeView.vue'
import { useUser } from '../stores/user'

const push=vi.hoisted(()=>vi.fn())
vi.mock('vue-router',()=>({useRouter:()=>({push})}))
vi.mock('../api',()=>({api:vi.fn(),resetCsrf:vi.fn()}))

describe('meeting home',()=>{
  beforeEach(()=>{setActivePinia(createPinia());push.mockReset();useUser().ready=true})
  it('normalizes a pasted meeting number and joins the correct room',async()=>{
    const wrapper=mount(MeetingHomeView,{global:{stubs:{teleport:true}}})
    const input=wrapper.get('input[aria-label="会议号"]')
    await input.setValue('123abc456-789')
    expect(input.element.value).toBe('123 456 789')
    await wrapper.get('form.join-plate').trigger('submit')
    expect(push).toHaveBeenCalledWith('/join/123456789')
    expect(wrapper.text()).toContain('会议画面示意')
    wrapper.unmount()
  })
})
