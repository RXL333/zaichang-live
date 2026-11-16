import { expect, it } from 'vitest'
import { chatParts, groupChat } from './chatText'

it('only links standalone http and https URLs, leaving other content as text',()=>{
  const parts=chatParts('<script>  https://example.com/a?b=1。 javascript:alert(1) javascript:https://bad.test ftp://elsewhere')
  expect(parts.filter(part=>part.href)).toEqual([{text:'https://example.com/a?b=1',href:'https://example.com/a?b=1'}])
  expect(parts.map(part=>part.text).join('')).toContain('<script>')
})
it('groups only consecutive messages from the same identified sender',()=>{
  const rows=groupChat([{user_id:'a',nickname:'甲',content:'一'},{user_id:'a',nickname:'甲',content:'二'},{user_id:'b',nickname:'乙',content:'三'},{user_id:'a',nickname:'甲',content:'四'}])
  expect(rows.map(row=>row.grouped)).toEqual([false,true,false,false])
})
