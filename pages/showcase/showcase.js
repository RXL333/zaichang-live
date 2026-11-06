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
  let animationFrame = 0
  let runId = 0
  let building = false
  let startedScroll = 0

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
  const ease = value => value * value * (3 - 2 * value)

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
    for (const agent of agents) {
      agent.cursor.style.opacity = '0'
      agent.box.style.opacity = '0'
    }
  }

  function finishBuild() {
    cancelAnimationFrame(animationFrame)
    runId++
    building = false
    if (currentPage) {
      currentPage.classList.remove('is-building')
      currentPage.querySelectorAll('[data-build]').forEach(item => item.classList.remove('is-built'))
    }
    hideAgents()
    status.textContent = reducedMotion.matches ? '已减少动态效果' : '页面搭建完成'
    control.innerHTML = reducedMotion.matches ? '查看页面 <span>↗</span>' : '重新搭建 <span>↻</span>'
    control.disabled = reducedMotion.matches
  }

  function itemRect(item) {
    const rect = item.getBoundingClientRect()
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
  }

  function endPoint(item) {
    const rect = itemRect(item)
    return { x: rect.x + Math.min(rect.width, 180), y: rect.y + Math.min(rect.height, 115) }
  }

  function startBuild(page) {
    cancelAnimationFrame(animationFrame)
    const thisRun = ++runId
    currentPage = page
    const items = [...page.querySelectorAll('[data-build]')]
    if (reducedMotion.matches || !items.length) {
      finishBuild()
      return
    }

    page.classList.add('is-building')
    items.forEach(item => item.classList.remove('is-built'))
    building = true
    startedScroll = window.scrollY
    status.textContent = '光标正在搭建页面'
    control.innerHTML = '跳过动画 <span>↗</span>'
    control.disabled = false

    const tasks = items.map(item => ({
      item,
      agent: Number(item.dataset.agent || 0),
      start: Number(item.dataset.at || 0) * 1000,
      duration: Number(item.dataset.duration || 1) * 1000,
    }))
    const total = Math.max(...tasks.map(task => task.start + task.duration)) + 450
    let startTime = null

    function draw(now) {
      if (thisRun !== runId) return
      if (startTime === null) startTime = now
      const elapsed = now - startTime

      for (const task of tasks) {
        if (elapsed >= task.start + task.duration * .72) task.item.classList.add('is-built')
      }

      agents.forEach((agent, index) => {
        const own = tasks.filter(task => task.agent === index).sort((a, b) => a.start - b.start)
        if (!own.length) {
          agent.cursor.style.opacity = '0'
          agent.box.style.opacity = '0'
          return
        }
        const task = own.find(entry => elapsed >= entry.start && elapsed < entry.start + entry.duration)
        if (!task) {
          agent.cursor.style.opacity = '0'
          agent.box.style.opacity = '0'
          return
        }

        const progress = clamp((elapsed - task.start) / task.duration, 0, 1)
        const rect = itemRect(task.item)
        const previous = own.filter(entry => entry.start < task.start).at(-1)
        const from = previous ? endPoint(previous.item) : { x: window.innerWidth * agent.origin[0], y: window.innerHeight * agent.origin[1] }
        const approach = ease(clamp(progress / .32, 0, 1))
        const drawProgress = ease(clamp((progress - .32) / .58, 0, 1))
        const bend = Math.sin(approach * Math.PI) * agent.curve
        const x = from.x + (rect.x - from.x) * approach + bend + Math.min(rect.width, 180) * drawProgress
        const y = from.y + (rect.y - from.y) * approach - bend * .55 + Math.min(rect.height, 115) * drawProgress

        agent.cursor.style.transform = `translate3d(${x}px,${y}px,0)`
        agent.cursor.style.opacity = String(Math.min(1, progress * 8, (1 - progress) * 7))
        const visible = progress >= .32 && progress < .9
        agent.box.style.opacity = visible ? '0.9' : '0'
        agent.box.style.transform = `translate3d(${rect.x}px,${rect.y}px,0)`
        agent.box.style.width = `${Math.max(1, rect.width * drawProgress)}px`
        agent.box.style.height = `${Math.max(1, rect.height * drawProgress)}px`
        agent.size.textContent = `${Math.round(rect.width * drawProgress)} × ${Math.round(rect.height * drawProgress)}`
      })

      if (elapsed >= total) finishBuild()
      else animationFrame = requestAnimationFrame(draw)
    }

    animationFrame = requestAnimationFrame(draw)
  }

  function changePage() {
    const requested = location.hash.slice(1)
    const route = routes.has(requested) ? requested : 'discover'
    const next = pages.find(page => page.dataset.page === route)
    if (next === currentPage) return
    if (currentPage) currentPage.classList.remove('is-building')
    cancelAnimationFrame(animationFrame)
    runId++
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
    currentPage = next
    startBuild(next)
  }

  control.addEventListener('click', () => {
    if (building) finishBuild()
    else if (currentPage && !reducedMotion.matches) {
      window.scrollTo({ top: 0, behavior: 'instant' })
      requestAnimationFrame(() => startBuild(currentPage))
    }
  })
  window.addEventListener('hashchange', changePage)
  window.addEventListener('scroll', () => {
    if (building && Math.abs(window.scrollY - startedScroll) > 90) finishBuild()
  }, { passive: true })
  window.addEventListener('resize', () => { if (building) finishBuild() }, { passive: true })
  reducedMotion.addEventListener?.('change', () => { if (currentPage) finishBuild() })

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
