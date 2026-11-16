import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const meeting={number:'123456789',title:'测试会议',ownerName:'主持人',status:'OPEN',hasPassword:true,isOwner:false}

async function mockBackend(page){
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method()
    let status=200,data={}
    if(path==='/api/system/status')data={status:'OK'}
    else if(path==='/api/csrf')data={headerName:'X-CSRF-TOKEN',token:'test-csrf'}
    else if(path==='/api/auth/me')data={authenticated:true,user:{id:'user-1',nickname:'测试成员'}}
    else if(path==='/api/meetings')data=[]
    else if(path==='/api/meetings/123456789' && method==='GET')data=meeting
    else if(path.endsWith('/join'))data={ok:true}
    else if(path.endsWith('/state'))data={...meeting,nickname:'测试成员'}
    else if(path.endsWith('/media-token'))data={url:'wss://example.invalid',token:'test-only'}
    else if(path.endsWith('/messages'))data=[]
    else if(path.endsWith('/obs'))data={ok:true}
    else {status=404;data={message:'未找到'}}
    await route.fulfill({status,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify(data)})
  })
  await page.route('**/node_modules/.vite/deps/livekit-client.js*',route=>route.fulfill({path:fileURLToPath(new URL('./fake-livekit.js',import.meta.url)),contentType:'text/javascript'}))
  await page.routeWebSocket('**/ws/meetings',socket=>{
    socket.onMessage(raw=>{
      const event=JSON.parse(raw)
      if(event.type==='JOIN'){
        socket.send(JSON.stringify({type:'JOINED'}))
        socket.send(JSON.stringify({type:'MEMBERS',members:[{userId:'user-1',nickname:'测试成员',host:false}]}))
      }
      if(event.type==='CHAT')socket.send(JSON.stringify({type:'CHAT_ACK',id:'message-1',seq:1,user_id:'user-1',nickname:'测试成员',client_id:event.clientId,content:event.content,created_at:Date.now()}))
    })
  })
}

async function tabTo(page,selector){
  const target=page.locator(selector).first()
  for(let i=0;i<50;i++){
    if(await target.evaluate(element=>element===document.activeElement))return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Keyboard focus did not reach ${selector}`)
}

test('the homepage illustration releases its entrance transform',async({page})=>{
  await mockBackend(page)
  await page.goto('/')
  const stage=page.locator('.hero-stage')
  await expect(stage).toBeVisible()
  await expect(stage).toHaveClass(/entrance-done/)
  await expect.poll(()=>stage.evaluate(element=>getComputedStyle(element).transform)).toBe('none')
  expect(await stage.evaluate(element=>getComputedStyle(element).animationName)).toBe('none')
  expect(await stage.evaluate(element=>getComputedStyle(element).opacity)).toBe('1')
  if(process.env.PHASE3_SCREENSHOTS)await page.screenshot({path:'../output/phase3-home-after-fix.png'})
})

test('meeting number, join validation and keyboard meeting flow',async({page})=>{
  await mockBackend(page)
  await page.goto('/')
  await tabTo(page,'input[aria-label="会议号"]')
  await page.keyboard.type('123456789')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/join\/123456789/)
  const password=page.getByLabel('会议密码')
  await expect(password).toBeVisible()
  await tabTo(page,'input[type="password"]')
  await page.keyboard.press('Enter')
  expect(await password.evaluate(element=>element.validity.valueMissing)).toBe(true)
  await page.keyboard.type('1234')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/meeting\/123456789/)
  await expect(page.getByLabel('开启麦克风')).toBeVisible()
  await page.keyboard.press('m')
  await expect(page.getByLabel('关闭麦克风')).toBeVisible()
  await page.keyboard.press('c')
  await tabTo(page,'input[aria-label="会议消息"]')
  await page.keyboard.type('键盘测试消息')
  await page.keyboard.press('Enter')
  await expect(page.locator('.conference-chat')).toContainText('键盘测试消息')
  await tabTo(page,'.leave-control')
  await page.keyboard.press('Enter')
  await tabTo(page,'.confirm-dialog .destructive')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/ended\/123456789/)
  await expect(page.getByText('已离开会议')).toBeVisible()
})

test('content security policy permits the configured backend and LiveKit origins',async({page})=>{
  await page.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.cspViolations.push(event.blockedURI))})
  await mockBackend(page)
  await page.routeWebSocket('wss://zaichang-live-jiydhuos.livekit.cloud/**',()=>{})
  await page.goto('/')
  const result=await page.evaluate(async()=>{
    const health=await fetch('https://18080-agq4iihhd6ie55qjpl2ezecsrm.instabox.tech/api/system/status').then(response=>response.json())
    const socket=await new Promise(resolve=>{const ws=new WebSocket('wss://zaichang-live-jiydhuos.livekit.cloud/rtc');ws.onopen=()=>{ws.close();resolve(true)};ws.onerror=()=>resolve(false);setTimeout(()=>resolve(false),3000)})
    return {health:health.status,socket,violations:window.cspViolations}
  })
  expect(result).toEqual({health:'OK',socket:true,violations:[]})
})

for(const viewport of [{width:375,height:667},{width:667,height:375},{width:1280,height:800}]){
  test(`meeting controls fit ${viewport.width}x${viewport.height}`,async({page})=>{
    await page.setViewportSize(viewport)
    await mockBackend(page)
    await page.goto('/join/123456789')
    await page.getByLabel('会议密码').fill('1234')
    await page.getByRole('button',{name:'加入会议'}).click()
    await expect(page.getByLabel('开启麦克风')).toBeVisible()
    const result=await page.evaluate(()=>{
      const button=document.querySelector('.leave-control').getBoundingClientRect()
      return {overflow:document.documentElement.scrollWidth>innerWidth,top:button.top,bottom:button.bottom,height:innerHeight}
    })
    expect(result.overflow).toBe(false)
    expect(result.top).toBeGreaterThanOrEqual(0)
    expect(result.bottom).toBeLessThanOrEqual(result.height+1)
    if(process.env.PHASE3_SCREENSHOTS){
      await page.waitForTimeout(400)
      await page.screenshot({path:`../output/phase3-meeting-${viewport.width}x${viewport.height}.png`})
    }
  })
}
