// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MeetingEndedView from './MeetingEndedView.vue'
import { api } from '../api'

vi.mock('vue-router',()=>({useRoute:()=>({params:{number:'123456789'}})}))
vi.mock('../api',()=>({api:vi.fn()}))
const stubs={RouterLink:{props:['to'],template:'<a><slot /></a>'},LogoMark:true}
beforeEach(()=>{history.replaceState({},'','/');api.mockReset()})
it('allows rejoining only after the server confirms the meeting is open',async()=>{
  history.replaceState({meetingTitle:'项目会议',elapsedSeconds:65},'','/')
  api.mockResolvedValue({status:'OPEN'})
  const wrapper=mount(MeetingEndedView,{global:{stubs}})
  await vi.waitFor(()=>expect(wrapper.text()).toContain('重新加入'))
  expect(wrapper.text()).toContain('1 分 5 秒')
  wrapper.unmount()
})
it('does not offer rejoining after the meeting ends',async()=>{
  history.replaceState({meetingEnded:true},'','/')
  const wrapper=mount(MeetingEndedView,{global:{stubs}})
  expect(wrapper.text()).toContain('会议已结束')
  expect(wrapper.text()).not.toContain('重新加入')
  expect(api).not.toHaveBeenCalled()
  wrapper.unmount()
})
