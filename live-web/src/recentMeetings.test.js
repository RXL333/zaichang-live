// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { clearRecent, readRecent, rememberMeeting } from './recentMeetings'

beforeEach(() => localStorage.clear())
it('keeps at most five recent meetings without storing passwords, and clears them', () => {
  for (let i=0;i<6;i++) rememberMeeting({number:String(100000000+i),title:`会议${i}`,password:'secret'},i)
  expect(readRecent()).toHaveLength(5)
  expect(JSON.stringify(localStorage)).not.toContain('secret')
  rememberMeeting({number:'100000002',title:'更新后的会议'},100)
  expect(readRecent()[0].number).toBe('100000002')
  expect(readRecent().filter(item=>item.number==='100000002')).toHaveLength(1)
  clearRecent();expect(readRecent()).toEqual([])
})
