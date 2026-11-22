// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MeetingJoinView from './MeetingJoinView.vue'
import { api } from '../api'
import { useServiceHealth } from '../stores/serviceHealth'
import { useUser } from '../stores/user'
import { useJoinDevices } from '../devicePreferences'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { number: '123456789' } }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../api', () => ({ api: vi.fn(), resetCsrf: vi.fn() }))

beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks();useUser().ready=true })

it('waits for the service, then looks up the meeting automatically', async () => {
  const service = useServiceHealth()
  service.status = 'starting'
  api.mockResolvedValue({ title: '项目会议', ownerName: '主持人', status: 'OPEN' })
  const wrapper = mount(MeetingJoinView, { global: { stubs: { RouterLink: true } } })
  expect(wrapper.text()).toContain('会议服务正在启动')
  expect(api).not.toHaveBeenCalled()
  service.status = 'ready'
  await vi.waitFor(() => expect(wrapper.text()).toContain('登录后加入会议'))
  expect(api).toHaveBeenCalledWith('/api/meetings/123456789')
  wrapper.unmount()
})

it.each([
  ['不存在',null,404,'未找到这个会议','重新输入会议号'],
  ['已结束',{title:'已结束的会议',status:'ENDED'},null,'会议已结束','返回首页'],
  ['已锁定',{title:'内部会议',status:'OPEN',locked:true},null,'会议已锁定','返回首页'],
])('shows a next action when the meeting is %s',async(_label,result,status,message,action)=>{
  useServiceHealth().status='ready'
  useUser().current={id:'u1',nickname:'参会者'}
  if(status)api.mockRejectedValue(Object.assign(new Error('未找到'),{status}))
  else api.mockResolvedValue(result)
  const wrapper=mount(MeetingJoinView,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}})
  await vi.waitFor(()=>expect(wrapper.text()).toContain(message))
  expect(wrapper.text()).toContain(action)
  wrapper.unmount()
})

it('offers login before showing the join form',async()=>{
  useServiceHealth().status='ready';api.mockResolvedValue({title:'项目会议',status:'OPEN'})
  const wrapper=mount(MeetingJoinView,{global:{stubs:{RouterLink:true}}})
  await vi.waitFor(()=>expect(wrapper.text()).toContain('登录后加入会议'))
  await wrapper.findAll('button').find(button=>button.text()==='登录账号').trigger('click')
  expect(useUser().authOpen).toBe(true)
  wrapper.unmount()
})

it('lets the same authorized session return to a locked meeting without a password', async () => {
  useServiceHealth().status = 'ready'
  useUser().current = { id: 'user-1', nickname: '参会者' }
  api.mockResolvedValue({ title: '项目会议', status: 'OPEN', locked: true, canRejoinLockedMeeting: true, hasPassword: true })
  const wrapper = mount(MeetingJoinView, { global: { stubs: { RouterLink: true } } })
  await vi.waitFor(() => expect(wrapper.text()).toContain('你仍可重新加入'))
  expect(wrapper.find('input[type="password"]').exists()).toBe(false)
  await wrapper.get('form').trigger('submit')
  expect(api).toHaveBeenCalledWith('/api/meetings/123456789/join', {
    method: 'POST', body: { nickname: '参会者', password: '' },
  })
  wrapper.unmount()
})

it('explains a service startup timeout and offers a retry',async()=>{
  useServiceHealth().status='timeout'
  const wrapper=mount(MeetingJoinView,{global:{stubs:{RouterLink:true}}})
  expect(wrapper.text()).toContain('会议服务暂未就绪')
  expect(wrapper.text()).toContain('重试连接')
  wrapper.unmount()
})

it('joins with devices off and never requests permission unless the user checks', async () => {
  const getUserMedia=vi.fn()
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia,addEventListener:vi.fn(),removeEventListener:vi.fn()}})
  useServiceHealth().status='ready'
  const user=useUser();user.current={id:'u1',nickname:'参会者'};user.ready=true
  api.mockResolvedValue({title:'项目会议',ownerName:'主持人',status:'OPEN'})
  const wrapper=mount(MeetingJoinView,{global:{stubs:{RouterLink:true}}})
  await vi.waitFor(()=>expect(wrapper.find('form').exists()).toBe(true))
  await wrapper.get('form').trigger('submit')
  await vi.waitFor(()=>expect(useJoinDevices().pending).not.toBeNull())
  expect(useJoinDevices().pending).toMatchObject({microphoneOn:false,cameraOn:false})
  expect(getUserMedia).not.toHaveBeenCalled()
  wrapper.unmount();delete navigator.mediaDevices
})
