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
it('summarises participants and chat messages when the room provides them',async()=>{
  history.replaceState({meetingEnded:true,elapsedSeconds:30,participants:4,chatCount:12},'','/')
  const wrapper=mount(MeetingEndedView,{global:{stubs}})
  expect(wrapper.text()).toContain('4 人参会，12 条聊天')
  wrapper.unmount()
})
it('shows no summary line when the counts are missing or invalid',async()=>{
  history.replaceState({meetingEnded:true,participants:'x'},'','/')
  const wrapper=mount(MeetingEndedView,{global:{stubs}})
  expect(wrapper.text()).not.toContain('本次会议：')
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
