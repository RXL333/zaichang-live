import { nextTick, ref } from 'vue'

export const sharedNumberTransition = ref(false)

export function goToMeetingJoin(router, path, reduced = false) {
  if (reduced || typeof document.startViewTransition !== 'function') return router.push(path)
  sharedNumberTransition.value=true
  document.documentElement.classList.add('shared-number-transition')
  try {
    const transition=document.startViewTransition(async()=>{await router.push(path);await nextTick()})
    Promise.resolve(transition.finished).catch(()=>{}).finally(()=>{
      sharedNumberTransition.value=false
      document.documentElement.classList.remove('shared-number-transition')
    })
    return transition.updateCallbackDone
  } catch {
    sharedNumberTransition.value=false
    document.documentElement.classList.remove('shared-number-transition')
    return router.push(path)
  }
}
