// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MeetingHomeView from './MeetingHomeView.vue'
import { useUser } from '../stores/user'
import { useServiceHealth } from '../stores/serviceHealth'
import { api } from '../api'

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
  it('loads meetings after the service recovers',async()=>{
    const user=useUser(),service=useServiceHealth()
    user.current={id:'user-1',nickname:'小林'}
    service.status='starting'
    api.mockResolvedValue([{id:'1',number:'123456789',title:'项目会议',status:'OPEN',createdAt:Date.now()}])
    const wrapper=mount(MeetingHomeView,{global:{stubs:{teleport:true}}})
    expect(api).not.toHaveBeenCalled()
    service.status='ready'
    await vi.waitFor(()=>expect(wrapper.text()).toContain('项目会议'))
    expect(api).toHaveBeenCalledWith('/api/meetings')
    wrapper.unmount()
  })
})
