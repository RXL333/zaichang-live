import { groupNumber } from './format'

export function meetingUrl(number, { origin = location.origin, base = import.meta.env.BASE_URL, hash = import.meta.env.VITE_HASH_ROUTER === 'true' } = {}) {
  const root = new URL(base, origin)
  return hash ? `${root.href}#/join/${number}` : `${root.href}join/${number}`
}

export function invitationText(meeting, url = meetingUrl(meeting.number)) {
  const lines = [`会议主题：${meeting.title}`, `会议号：${groupNumber(meeting.number)}`, `加入链接：${url}`]
  if (meeting.hasPassword) lines.push('会议已设置密码，请向主持人获取')
  return lines.join('\n')
}

export function extractMeetingNumber(value) {
  const text = String(value ?? '')
  const link = text.match(/\/join\/(\d{9})(?!\d)/i)
  if (link) return link[1]
  const labelled = text.match(/会议号(?:码)?[：:\s]*((?:\d[ \t-]*){9})(?!\d)/)
  if (labelled) return labelled[1].replace(/\D/g, '')
  return text.replace(/\D/g, '').slice(0, 9)
}
