(() => {
  'use strict'

  const pages = [...document.querySelectorAll('[data-page]')]
  const links = [...document.querySelectorAll('[data-route]')]
  const layer = document.querySelector('#swarm-layer')
  const status = document.querySelector('#build-status')
  const control = document.querySelector('#build-control')
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const routes = new Set(pages.map(page => page.dataset.page))
  const builders = [
    { name: '布局', color: '#c84c38', origin: [.18, .23], curve: -34 },
    { name: '文字', color: '#8e64cb', origin: [.43, .12], curve: 38 },
    { name: '画面', color: '#407dbc', origin: [.79, .2], curve: -28 },
    { name: '灵感', color: '#779a37', origin: [.73, .48], curve: 30 },
  ]
  let currentPage = null
  let tasks = []
  let total = 1
  let distance = 1
  let frame = 0
  let pointer = null
  let lastProgress = -1
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
  const ease = value => value * value * (3 - 2 * value)

  // Keep the stage fixed while the scroll position drives the build, then
  // place it back in the document so the completed page can be browsed.
  const track = document.createElement('div')
  track.className = 'build-scroll-track'
  const stage = document.createElement('div')
  stage.className = 'build-scroll-stage'
  const banner = document.querySelector('.demo-banner')
  banner.before(track)
  track.append(stage)
  stage.append(banner, document.querySelector('.topbar'), document.querySelector('.app-layout'))

  function makeBuilder(builder) {
    const cursor = document.createElement('div')
    cursor.className = 'swarm-agent'
    cursor.style.setProperty('--agent', builder.color)
    cursor.innerHTML = '<svg viewBox="0 0 24 26" aria-hidden="true"><path d="M4 2.5 18.6 14 12 15.2 8.9 22Z" fill="' + builder.color + '" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg><span class="agent-name">' + builder.name + '</span>'
    const box = document.createElement('div')
    box.className = 'selection-box'
    box.style.setProperty('--agent', builder.color)
    const size = document.createElement('span')
    size.className = 'selection-size'
    box.append(size)
    layer.append(box, cursor)
    return { ...builder, cursor, box, size }
  }

  const agents = builders.map(makeBuilder)
  function hideAgents() {
    agents.forEach(agent => { agent.cursor.style.opacity = '0'; agent.box.style.opacity = '0' })
  }
  function itemRect(item) {
    const rect = item.getBoundingClientRect()
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
  }
  function endPoint(item) {
    const rect = itemRect(item)
    return { x: rect.x + Math.min(rect.width, 180), y: rect.y + Math.min(rect.height, 115) }
  }

  function draw() {
    frame = 0
    if (!currentPage || reducedMotion.matches) return
    const progress = clamp(window.scrollY / distance, 0, 1)
    const elapsed = progress * total
    const complete = progress >= .9999
    stage.style.position = complete ? 'absolute' : 'fixed'
    stage.style.top = complete ? `${distance}px` : '0px'
    stage.style.maxHeight = complete ? '' : '100vh'
    stage.style.overflow = complete ? '' : 'hidden'
    // Gently reveal lower content during the build, then return to the top at completion.
    const panPhase = clamp((progress - .25) / .75, 0, 1)
    const panLimit = Math.min(window.innerHeight * .8, Math.max(0, stage.scrollHeight - window.innerHeight))
    stage.scrollTop = complete ? 0 : Math.round(Math.sin(panPhase * Math.PI) * panLimit)
    for (const task of tasks) task.item.classList.toggle('is-built', complete || elapsed >= task.start + task.duration * .72)

    if (complete) {
      hideAgents()
      status.textContent = '页面搭建完成'
      control.innerHTML = '重新搭建 <span>↻</span>'
    } else {
      status.textContent = progress < .005 ? '向下滚动，开始搭建' : `向下滚动搭建 · ${Math.round(progress * 100)}%`
      control.innerHTML = '直接查看 <span>↗</span>'
      agents.forEach((agent, index) => {
        const own = tasks.filter(task => task.agent === index)
        const task = own.find(entry => elapsed >= entry.start && elapsed < entry.start + entry.duration)
        if (!task) {
          agent.box.style.opacity = '0'
          if (pointer && progress > 0) {
            const x = pointer.x + 24 + index * 13
            const y = pointer.y + 25 + index * 10
            agent.cursor.style.transform = `translate3d(${x}px,${y}px,0)`
            agent.cursor.style.opacity = '.48'
          } else agent.cursor.style.opacity = '0'
          return
        }
        const part = clamp((elapsed - task.start) / task.duration, 0, 1)
        const rect = itemRect(task.item)
        const previous = own.filter(entry => entry.start < task.start).at(-1)
        const from = previous ? endPoint(previous.item) : { x: window.innerWidth * agent.origin[0], y: window.innerHeight * agent.origin[1] }
        const approach = ease(clamp(part / .32, 0, 1))
        const drawn = ease(clamp((part - .32) / .58, 0, 1))
        const bend = Math.sin(approach * Math.PI) * agent.curve
        let x = from.x + (rect.x - from.x) * approach + bend + Math.min(rect.width, 180) * drawn
        let y = from.y + (rect.y - from.y) * approach - bend * .55 + Math.min(rect.height, 115) * drawn
        if (pointer) {
          const dx = x - pointer.x, dy = y - pointer.y, d = Math.hypot(dx, dy)
          if (d > 1 && d < 140) { const push = (1 - d / 140) * 12; x += dx / d * push; y += dy / d * push }
        }
        agent.cursor.style.transform = `translate3d(${x}px,${y}px,0)`
        agent.cursor.style.opacity = String(Math.min(1, part * 8, (1 - part) * 7))
        agent.box.style.opacity = part >= .32 && part < .9 ? '0.9' : '0'
        agent.box.style.transform = `translate3d(${rect.x}px,${rect.y}px,0)`
        agent.box.style.width = `${Math.max(1, rect.width * drawn)}px`
        agent.box.style.height = `${Math.max(1, rect.height * drawn)}px`
        agent.size.textContent = `${Math.round(rect.width * drawn)} × ${Math.round(rect.height * drawn)}`
      })
    }
    lastProgress = progress
  }
  function scheduleDraw() { if (!frame) frame = requestAnimationFrame(draw) }
  function configureTrack() {
    distance = Math.max(window.innerHeight * 7, 4200)
    track.style.position = 'relative'
    track.style.paddingBottom = '0px'
    stage.style.width = '100%'
    stage.style.left = '0px'
    if (reducedMotion.matches) {
      track.style.height = ''
      stage.style.position = ''
      stage.style.top = ''
      stage.style.maxHeight = ''
      stage.style.overflow = ''
      return
    }
    stage.style.position = 'fixed'
    stage.style.top = '0px'
    stage.style.maxHeight = '100vh'
    stage.style.overflow = 'hidden'
    track.style.height = `${distance + Math.max(stage.scrollHeight, window.innerHeight)}px`
  }
  function startBuild(page) {
    currentPage = page
    configureTrack()
    const items = [...page.querySelectorAll('[data-build]')]
    tasks = items.map(item => ({ item, agent: Number(item.dataset.agent || 0), start: Number(item.dataset.at || 0) * 1000, duration: Number(item.dataset.duration || 1) * 1000 })).sort((a, b) => a.start - b.start)
    total = Math.max(1, ...tasks.map(task => task.start + task.duration)) + 500
    page.classList.toggle('is-building', !reducedMotion.matches)
    items.forEach(item => item.classList.remove('is-built'))
    control.disabled = reducedMotion.matches
    if (reducedMotion.matches) {
      hideAgents()
      status.textContent = '已减少动态效果'
      control.innerHTML = '查看页面 <span>↗</span>'
    } else scheduleDraw()
  }
  function changePage() {
    const requested = location.hash.slice(1)
    const route = routes.has(requested) ? requested : 'discover'
    const next = pages.find(page => page.dataset.page === route)
    if (next === currentPage) return
    if (currentPage) currentPage.classList.remove('is-building')
    hideAgents()
    pages.forEach(page => { page.hidden = page !== next })
    links.forEach(link => {
      const active = link.dataset.route === route
      link.classList.toggle('active', active)
      if (active) link.setAttribute('aria-current', 'page')
      else link.removeAttribute('aria-current')
    })
    document.title = ({ discover: '发现直播', watch: '观看直播', studio: '主播工作台' })[route] + ' · 在场 LIVE 展示'
    window.scrollTo({ top: 0, behavior: 'instant' })
    startBuild(next)
  }
  control.addEventListener('click', () => {
    if (reducedMotion.matches) return
    window.scrollTo({ top: lastProgress >= .9999 ? 0 : distance, behavior: 'instant' })
    scheduleDraw()
  })
  window.addEventListener('hashchange', changePage)
  window.addEventListener('scroll', scheduleDraw, { passive: true })
  window.addEventListener('resize', () => { configureTrack(); scheduleDraw() }, { passive: true })
  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return
    pointer = { x: event.clientX, y: event.clientY }
    scheduleDraw()
  }, { passive: true })
  document.addEventListener('pointerleave', () => { pointer = null; scheduleDraw() })
  reducedMotion.addEventListener?.('change', () => { if (currentPage) startBuild(currentPage) })

  let toastTimer
  function toast(message) {
    const element = document.querySelector('#toast')
    element.textContent = message
    element.classList.add('visible')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => element.classList.remove('visible'), 2600)
  }

  document.querySelector('[data-demo-follow]').addEventListener('click', event => {
    const button = event.currentTarget
    const selected = button.getAttribute('aria-pressed') !== 'true'
    button.setAttribute('aria-pressed', String(selected))
    button.querySelector('span').textContent = selected ? '已关注（演示）' : '关注演示'
    toast(selected ? '已切换为关注状态，仅供演示' : '已取消演示关注')
  })

  document.querySelector('#demo-chat').addEventListener('submit', event => {
    event.preventDefault()
    const input = document.querySelector('#demo-message')
    const message = input.value.trim()
    if (!message) return
    const row = document.createElement('div')
    row.className = 'chat-message'
    const avatar = document.createElement('span')
    avatar.className = 'chat-avatar avatar-lime'
    avatar.textContent = '我'
    const content = document.createElement('p')
    const name = document.createElement('strong')
    name.textContent = '我 · 本地演示'
    const text = document.createElement('span')
    text.textContent = message
    content.append(name, text)
    row.append(avatar, content)
    const messages = document.querySelector('#chat-messages')
    messages.append(row)
    messages.scrollTop = messages.scrollHeight
    input.value = ''
  })

  document.querySelector('[data-heart]').addEventListener('click', event => {
    const button = event.currentTarget
    button.classList.remove('pop')
    void button.offsetWidth
    button.classList.add('pop')
    toast('收到一颗演示爱心')
  })

  document.querySelectorAll('[data-device]').forEach(button => {
    button.addEventListener('click', () => {
      const on = button.getAttribute('aria-pressed') !== 'true'
      button.setAttribute('aria-pressed', String(on))
      button.classList.toggle('is-on', on)
      toast('仅切换演示状态，不会操作真实设备')
    })
  })

  document.querySelector('#demo-broadcast').addEventListener('click', event => {
    const button = event.currentTarget
    const active = button.dataset.active !== 'true'
    button.dataset.active = String(active)
    button.innerHTML = active ? '结束预演 <span>↗</span>' : '开始预演 <span>↗</span>'
    document.querySelector('#preview-status').textContent = active ? '模拟预演中 · 未开播' : '示意画面 · 未开播'
    toast(active ? '预演已开始，不会发起真实直播' : '已结束预演')
  })

  document.querySelectorAll('[data-color]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-color]').forEach(option => {
        const selected = option === button
        option.classList.toggle('selected', selected)
        option.setAttribute('aria-pressed', String(selected))
      })
      document.querySelector('.creator-stage').dataset.color = button.dataset.color
    })
  })

  document.querySelector('#demo-settings').addEventListener('submit', event => {
    event.preventDefault()
    toast('设置仅在当前页面显示，刷新后重置')
  })

  changePage()
})()
