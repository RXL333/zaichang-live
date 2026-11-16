// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { goToMeetingJoin, sharedNumberTransition } from './routeMotion'

afterEach(()=>{delete document.startViewTransition;document.documentElement.classList.remove('shared-number-transition');sharedNumberTransition.value=false})
it('falls back to normal navigation without View Transitions or with reduced motion',async()=>{
  const router={push:vi.fn().mockResolvedValue()}
  await goToMeetingJoin(router,'/join/123456789')
  expect(router.push).toHaveBeenCalledWith('/join/123456789')
  document.startViewTransition=vi.fn()
  await goToMeetingJoin(router,'/join/987654321',true)
  expect(document.startViewTransition).not.toHaveBeenCalled()
})
it('navigates during the shared-number transition when supported',async()=>{
  const router={push:vi.fn().mockResolvedValue()}
  let finish
  document.startViewTransition=vi.fn(callback=>({updateCallbackDone:callback(),finished:new Promise(resolve=>{finish=resolve})}))
  await goToMeetingJoin(router,'/join/123456789')
  expect(router.push).toHaveBeenCalledWith('/join/123456789')
  expect(sharedNumberTransition.value).toBe(true)
  finish();await Promise.resolve();await Promise.resolve();await Promise.resolve()
  expect(sharedNumberTransition.value).toBe(false)
})
