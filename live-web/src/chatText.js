// Return text fragments and verified http(s) links; Vue renders every fragment as text.
export function chatParts(content) {
  const text=String(content || ''),pattern=/https?:\/\/[^\s<>"']+/gi,parts=[]
  let cursor=0,match
  while((match=pattern.exec(text))){
    if(match.index>0 && /[\w@:/]/.test(text[match.index-1]))continue
    const candidate=match[0].replace(/[),.!?;:，。！？；：）]+$/u,'')
    let url
    try{url=new URL(candidate)}catch{continue}
    if(!['http:','https:'].includes(url.protocol) || !url.hostname)continue
    if(match.index>cursor)parts.push({text:text.slice(cursor,match.index)})
    parts.push({text:candidate,href:url.href});cursor=match.index+candidate.length
  }
  if(cursor<text.length)parts.push({text:text.slice(cursor)})
  return parts
}

export function groupChat(messages) {
  return messages.map((message,index)=>({
    ...message,
    grouped:!!message.user_id && message.user_id===messages[index-1]?.user_id && message.nickname===messages[index-1]?.nickname,
    parts:chatParts(message.content),
  }))
}
