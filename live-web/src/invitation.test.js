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
})
