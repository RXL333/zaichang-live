import { nextTick, ref } from 'vue'

export const sharedNumberTransition = ref(false)

function waitForNumber() {
  if(document.querySelector('.join-intro .room-number'))return Promise.resolve()
  return new Promise(resolve=>{
    let timer
    const observer=new MutationObserver(()=>{if(document.querySelector('.join-intro .room-number'))finish()})
    function finish(){observer.disconnect();clearTimeout(timer);resolve()}
    observer.observe(document.body,{childList:true,subtree:true})
    timer=setTimeout(finish,1000)
  })
}

export function goToMeetingJoin(router, path, reduced = false) {
  if (reduced || typeof document.startViewTransition !== 'function') return router.push(path)
  sharedNumberTransition.value=true
  document.documentElement.classList.add('shared-number-transition')
  try {
    const transition=document.startViewTransition(async()=>{await router.push(path);await nextTick();await waitForNumber()})
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
