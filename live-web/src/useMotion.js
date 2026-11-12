import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useMotion() {
  let query
  try { query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null } catch { query = null }
  const reduced = ref(query?.matches === true)
  const update = event => { reduced.value = event.matches }
  onMounted(() => {
    if (query?.addEventListener) query.addEventListener('change', update)
    else query?.addListener?.(update)
  })
  onBeforeUnmount(() => {
    if (query?.removeEventListener) query.removeEventListener('change', update)
    else query?.removeListener?.(update)
  })
  return { reduced }
}
