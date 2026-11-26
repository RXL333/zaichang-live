import { describe, expect, it } from 'vitest'
import { extractMeetingNumber, invitationText, meetingUrl } from './invitation'

describe('meeting invitations', () => {
  const url = meetingUrl('123456789', { origin:'https://example.org', base:'/meet/', hash:true })
  it('extracts the same number from numbers, formatted numbers, links and invitations', () => {
    const invitation = `会议主题：2026 项目会\n会议号：123 456 789\n加入链接：${url}\n会议已设置密码，请向主持人获取`
    for (const value of ['123456789', '123 456 789', '123-456-789', url, invitation])
      expect(extractMeetingNumber(value)).toBe('123456789')
  })
  it('includes the topic and password reminder without revealing the password', () => {
    const text = invitationText({ title:'项目周会', number:'123456789', hasPassword:true, password:'secret-value' }, url)
    expect(text).toContain('会议主题：项目周会')
    expect(text).toContain('会议号：123 456 789')
    expect(text).toContain(url)
    expect(text).toContain('请向主持人获取')
    expect(text).not.toContain('secret-value')
    expect(invitationText({ title:'周会', number:'123456789', hasPassword:false }, url)).not.toContain('密码')
  })
  it('lists the agenda with presenters and minutes, and still yields the same meeting number', () => {
    const agenda = [{ title:'项目介绍', presenter:'林夏', minutes:5 }, { title:'', presenter:'', minutes:3 }]
    const text = invitationText({ title:'答辩', number:'123456789', hasPassword:true }, url, agenda)
    expect(text).toContain('汇报议程：\n1. 项目介绍｜林夏｜5 分钟\n2. 未命名环节｜3 分钟')
    expect(text.indexOf('汇报议程')).toBeLessThan(text.indexOf('请向主持人获取'))
    expect(extractMeetingNumber(text)).toBe('123456789')
  })
  it('omits the agenda block when there is none and caps long agendas', () => {
    const base = { title:'周会', number:'123456789', hasPassword:false }
    expect(invitationText(base, url, [])).not.toContain('汇报议程')
    expect(invitationText(base, url)).not.toContain('汇报议程')
    const long = Array.from({ length:12 }, (_, i) => ({ title:`环节${i + 1}`, presenter:'甲', minutes:2 }))
    const text = invitationText(base, url, long)
    expect(text).toContain('10. 环节10')
    expect(text).not.toContain('11. ')
    expect(text).toContain('…另有 2 个环节')
  })
})
