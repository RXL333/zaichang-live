import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const meeting={number:'123456789',title:'测试会议',ownerName:'主持人',status:'OPEN',hasPassword:true,isOwner:false}

async function mockBackend(page,{hostControls=false}={}){
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method()
    let status=200,data={}
    if(path==='/api/system/status')data={status:'OK'}
    else if(path==='/api/csrf')data={headerName:'X-CSRF-TOKEN',token:'test-csrf'}
    else if(path==='/api/auth/me')data={authenticated:true,user:{id:'user-1',nickname:'测试成员'}}
    else if(path==='/api/meetings')data=[]
    else if(path==='/api/meetings/123456789' && method==='GET')data=meeting
    else if(path.endsWith('/join'))data={ok:true}
    else if(path.endsWith('/state'))data={...meeting,nickname:'测试成员',...(hostControls ? {isOwner:true,hostUserId:'user-1',locked:false} : {})}
    else if(path.endsWith('/media-token'))data={url:'wss://example.invalid',token:'test-only'}
    else if(path.endsWith('/messages'))data=[]
    else if(path.endsWith('/obs'))data={ok:true}
    else {status=404;data={message:'未找到'}}
    await route.fulfill({status,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify(data)})
  })
  await page.route('**/node_modules/.vite/deps/livekit-client.js*',route=>route.fulfill({path:fileURLToPath(new URL('./fake-livekit.js',import.meta.url)),contentType:'text/javascript'}))
  const connections = []
  await page.routeWebSocket('**/ws/meetings',socket=>{
    connections.push(socket)
    socket.onMessage(raw=>{
      const event=JSON.parse(raw)
      if(event.type==='JOIN'){
        socket.send(JSON.stringify({type:'JOINED',...(hostControls ? {hostUserId:'user-1',locked:false} : {})}))
        const members=[{userId:'user-1',nickname:'测试成员',host:hostControls}]
        if(hostControls)members.push({userId:'user-2',nickname:'同事',host:false})
        socket.send(JSON.stringify({type:'MEMBERS',members}))
      }
      if(event.type==='SET_MEETING_LOCK' && hostControls)socket.send(JSON.stringify({type:'MEETING_LOCK_CHANGED',locked:event.locked}))
      if(event.type==='CHAT')socket.send(JSON.stringify({type:'CHAT_ACK',id:'message-1',seq:1,user_id:'user-1',nickname:'测试成员',client_id:event.clientId,content:event.content,created_at:Date.now()}))
    })
  })
  return connections
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

async function expectReadableTheme(page) {
  const ratios = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    const luminance = value => {
      const color = value.startsWith('--') ? style.getPropertyValue(value).trim() : value
      const hex = color.length === 4 ? [...color.slice(1)].map(digit => digit + digit).join('') : color.slice(1)
      const channels = [0, 2, 4].map(index => {
        const channel = parseInt(hex.slice(index, index + 2), 16) / 255
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
      })
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
    }
    const pairs = [
      ['--ink', '--mist'], ['--ink', '--paper'], ['--ink', '--surface-soft'],
      ['--slate', '--mist'], ['--slate', '--paper'], ['--slate', '--surface-soft'],
      ['--slate-soft', '--mist'], ['--slate-soft', '--paper'],
      ['--presence', '--mist'], ['--presence', '--paper'], ['--presence-dark', '--presence-wash'],
      ['--danger', '--paper'], ['#fff', '--danger-fill'], ['#fff', '--primary-fill'],
      ['--strong-ink', '--strong-fill'], ['--notice-ink', '--notice-fill'],
    ]
    return pairs.map(pair => {
      const [lighter, darker] = pair.map(luminance).sort((a, b) => b - a)
      return { colors: pair.join(' / '), ratio: (lighter + .05) / (darker + .05) }
    })
  })
  for (const { colors, ratio } of ratios) expect(ratio, colors).toBeGreaterThanOrEqual(4.5)
}

test('lobby theme follows the system and keeps an explicit mobile choice', async ({ page }) => {
  await mockBackend(page)
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/')
  const root = page.locator('html')
  const appearance = page.getByRole('combobox', { name: '页面外观' })
  await expect(appearance).toHaveValue('system')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#151b18')
  await expectReadableTheme(page)
  await expect(page.locator('.hero-text h1 .rise').first()).toHaveCSS('opacity', '1')
  if (process.env.PHASE4_SCREENSHOTS) await page.screenshot({ path: '../output/phase4-home-dark.png' })

  await page.emulateMedia({ colorScheme: 'light' })
  await expect(root).toHaveAttribute('data-theme', 'light')
  await expectReadableTheme(page)
  await page.setViewportSize({ width: 320, height: 668 })
  await appearance.selectOption('dark')
  await page.reload()
  await expect(appearance).toHaveValue('dark')
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: '打开菜单' })).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  await page.getByRole('button', { name: '创建会议', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: '创建会议' })
  await expect(dialog).toHaveCSS('background-color', 'rgb(32, 41, 37)')
  await expect(dialog.getByLabel('会议名称')).toBeFocused()
  if (process.env.PHASE4_SCREENSHOTS) await page.screenshot({ path: '../output/phase4-modal-dark.png' })
  await page.keyboard.press('Escape')

  await page.route('**/api/auth/me', route => route.fulfill({ json: { authenticated: false } }))
  await page.reload()
  await page.getByRole('button', { name: '打开菜单' }).click()
  await page.getByRole('button', { name: '登录 / 注册', exact: true }).click()
  const login = page.getByRole('dialog', { name: '登录在场' })
  await expect(login).toHaveCSS('background-color', 'rgb(32, 41, 37)')
  await expect(login.getByLabel('账号')).toBeFocused()
  await page.keyboard.press('Escape')
  await appearance.selectOption('system')
  await expect(root).toHaveAttribute('data-theme', 'light')
})

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`meeting arrival respects ${reducedMotion} motion and does not replay on reconnect`, async ({ page }) => {
    const connections = await mockBackend(page)
    await page.emulateMedia({ reducedMotion })
    await page.addInitScript(() => {
      window.meetingEntryAnimations = []
      document.addEventListener('animationstart', event => {
        if (['join-pulse', 'meeting-arrive'].includes(event.animationName)) {
          window.meetingEntryAnimations.push([event.animationName, getComputedStyle(event.target).animationDuration])
        }
      })
    })
    await page.goto('/join/123456789')
    await page.getByLabel('会议密码').fill('1234')
    await page.getByRole('button', { name: '加入会议', exact: true }).click()
    await expect(page).toHaveURL(/\/meeting\/123456789/)
    const layout = page.locator('.conference-layout')
    await expect(layout).toBeVisible()

    const readAnimations = () => page.evaluate(() => window.meetingEntryAnimations)
    const expected = reducedMotion === 'reduce'
      ? [['meeting-arrive', '0.12s']]
      : [['join-pulse', '0.2s'], ['meeting-arrive', '0.2s']]
    await expect.poll(readAnimations).toEqual(expected)
    await expect(layout).not.toHaveClass(/entering/)

    if (reducedMotion === 'no-preference') {
      const status = page.locator('.connection-status')
      await expect(status).toHaveClass(/connected/)
      await connections[0].close({ code: 1012, reason: 'Simulate network reconnect' })
      await expect.poll(() => connections.length).toBe(2)
      await expect(status).toHaveClass(/connected/)
      expect(await readAnimations()).toEqual(expected)
    }

    await page.reload()
    await expect(layout).toBeVisible()
    await expect(layout).not.toHaveClass(/entering/)
    expect(await readAnimations()).toEqual([])
  })
}

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

test('the mobile members panel can lock and unlock the meeting', async ({page}) => {
  await page.setViewportSize({width:375,height:667})
  await mockBackend(page,{hostControls:true})
  await page.goto('/join/123456789')
  await page.getByLabel('会议密码').fill('1234')
  await page.getByRole('button',{name:'加入会议'}).click()
  await page.getByRole('button',{name:'更多会议功能'}).click()
  await page.getByRole('button',{name:'成员（2）'}).click()
  const actions=page.getByRole('group',{name:'主持人操作'})
  await expect(actions.getByRole('button',{name:'全员静音'})).toBeEnabled()
  await actions.getByRole('button',{name:'锁定会议'}).click()
  await page.getByRole('dialog',{name:'锁定会议'}).getByRole('button',{name:'锁定会议'}).click()
  await expect(page.getByRole('img',{name:'会议已锁定'})).toBeVisible()
  if(process.env.HOST_CONTROLS_SCREENSHOT) await page.screenshot({path:'../output/host-controls-mobile.png'})
  await actions.getByRole('button',{name:'解锁会议'}).click()
  await expect(page.getByRole('img',{name:'会议已锁定'})).toHaveCount(0)
})

test('the mobile drawer follows a drag, snaps back and restores keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await mockBackend(page)
  await page.goto('/meeting/123456789')
  const more = page.getByRole('button', { name: '更多会议功能' })
  const menuItem = page.getByRole('button', { name: '成员（1）' })
  async function showMembers() {
    await more.click()
    await menuItem.click()
  }
  await showMembers()
  const drawer = page.getByRole('dialog', { name: '会议互动' })
  const members = drawer.getByRole('tab', { name: /成员/ })
  const chat = drawer.getByRole('tab', { name: '聊天' })
  const handle = drawer.getByRole('button', { name: '关闭互动面板' })
  await expect(members).toBeFocused()
  if(process.env.INTERACTION_SCREENSHOTS)await page.screenshot({path:'../output/interaction-drawer.png',animations:'disabled'})
  await page.keyboard.press('ArrowRight')
  await expect(chat).toBeFocused()
  await expect(drawer.getByRole('tabpanel', { name: '聊天' })).toBeVisible()
  await drawer.getByRole('textbox', { name: '会议消息' }).focus()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(more).toBeFocused()

  await showMembers()
  const position = () => drawer.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)
  await expect.poll(position).toBe(0)
  async function dragHandle(distance) {
    const box = await handle.boundingBox()
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + distance, { steps: 5 })
    await expect.poll(position).toBeGreaterThanOrEqual(distance - 2)
    await page.mouse.up()
  }
  await dragHandle(32)
  await expect.poll(position).toBe(0)
  await dragHandle(95)
  await expect(drawer).toBeHidden()
  await expect(more).toBeFocused()

  const microphone = page.locator('.toolbar-controls .meeting-control').first()
  const button = await microphone.boundingBox()
  const x = button.x + button.width / 2, y = button.y + button.height / 2
  const touch = await page.context().newCDPSession(page)
  await touch.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x,y}] })
  for (const distance of [25, 55, 85]) {
    await touch.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x,y:y-distance}] })
  }
  await touch.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] })
  await expect(drawer).toBeVisible()
  await expect(microphone).toHaveAttribute('aria-label','开启麦克风')
})

test('chat opens at the latest message and keeps the reading position across tabs', async ({ page }) => {
  const connections = await mockBackend(page)
  await page.goto('/meeting/123456789')
  await expect(page.locator('.connection-status')).toHaveClass(/\bconnected\b/)
  const chatTab = page.getByRole('tab', { name: /聊天/ })
  const membersTab = page.getByRole('tab', { name: /成员/ })
  const chat = page.getByRole('region', { name: '消息记录' })
  function receiveMessage(seq) {
    connections[0].send(JSON.stringify({ type:'CHAT', id:`msg-${seq}`, seq,
      user_id:`colleague-${seq % 2}`, nickname:`同事 ${seq % 2 + 1}`, content:`会议消息 ${seq}`, created_at:Date.now() }))
  }
  for (let seq = 1; seq <= 28; seq++) receiveMessage(seq)
  await expect(chatTab).toContainText('28')
  await chatTab.click()
  const distanceFromBottom = () => chat.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)
  await expect.poll(distanceFromBottom).toBeLessThanOrEqual(2)

  await chat.evaluate(el => { el.scrollTop = 104 })
  await membersTab.click()
  receiveMessage(29)
  receiveMessage(30)
  await expect(chatTab).toContainText('2')
  await chatTab.click()
  await expect.poll(() => chat.evaluate(el => el.scrollTop)).toBe(104)
  const jump = page.getByRole('button', { name:'2 条新消息' })
  await expect(jump).toBeVisible()
  if(process.env.INTERACTION_SCREENSHOTS)await page.screenshot({path:'../output/interaction-chat.png',animations:'disabled'})
  await jump.click()
  await expect.poll(distanceFromBottom).toBeLessThanOrEqual(2)
  await expect(jump).toBeHidden()
  await expect(chat).toBeFocused()
})

test('meeting feedback and popovers stay clear of the stage and restore focus', async ({ page }) => {
  const connections = await mockBackend(page)
  await page.goto('/meeting/123456789')
  const status = page.locator('.connection-status')
  await expect(status).toHaveClass(/\bconnected\b/)

  const audio = page.getByRole('button', { name: '选择麦克风和扬声器' })
  const gallery = page.getByRole('button', { name: '画廊' })
  await audio.click()
  await expect(audio).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Tab')
  await expect(page.locator('.device-popover button').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(audio).toBeFocused()
  await expect(audio).toHaveAttribute('aria-expanded', 'false')
  await audio.click()
  await gallery.click()
  await expect(audio).toHaveAttribute('aria-expanded', 'false')

  const invite = page.getByRole('button', { name: '邀请参会者' })
  await invite.click()
  const dialog = page.getByRole('dialog', { name: '邀请参会' })
  await expect(dialog.getByRole('button', { name: '关闭' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(invite).toBeFocused()

  const stage = page.locator('.meeting-stage')
  const before = await stage.boundingBox()
  await connections[0].close({ code:1012, reason:'Simulate reconnect' })
  await expect(page.locator('.connection-banner')).toBeVisible()
  expect(await stage.boundingBox()).toEqual(before)
  await expect.poll(() => connections.length).toBe(2)
  await expect(status).toHaveClass(/\bconnected\b/)

  connections[1].send(JSON.stringify({ type:'NOTICE', message:'会议信息已更新' }))
  const notice = page.locator('.meeting-toast')
  await expect(notice).toHaveText('会议信息已更新')
  await expect(notice).toHaveCSS('pointer-events','none')
  expect(await stage.boundingBox()).toEqual(before)
  if(process.env.INTERACTION_SCREENSHOTS)await page.screenshot({path:'../output/interaction-feedback.png',animations:'disabled'})
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
