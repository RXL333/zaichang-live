import { onBeforeUnmount, ref } from 'vue'

export function useSpeakerActivity(holdMs = 400) {
  const active = ref(new Set()), recent = ref('')
  const timers = new Map(), order = new Map()
  let sequence = 0, current = new Set()
  function refreshRecent() {
    recent.value = [...active.value].sort((a, b) => (order.get(b) || 0) - (order.get(a) || 0))[0] || ''
  }
  function update(ids) {
    const next = new Set(ids.filter(Boolean))
    for (const id of next) {
      clearTimeout(timers.get(id)); timers.delete(id)
      if (!current.has(id)) order.set(id, ++sequence)
    }
    const shown = new Set(active.value)
    for (const id of next) shown.add(id)
    active.value = shown
    for (const id of current) if (!next.has(id) && !timers.has(id)) {
      timers.set(id, setTimeout(() => {
        timers.delete(id)
        const remaining = new Set(active.value); remaining.delete(id); active.value = remaining
        refreshRecent()
      }, holdMs))
    }
    current = next; refreshRecent()
  }
  function clear() {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear(); order.clear(); current = new Set(); active.value = new Set(); recent.value = ''
  }
  onBeforeUnmount(clear)
  return { active, recent, update, clear }
}
