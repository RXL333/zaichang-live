import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const storageKey = 'zaichang.theme'

function savedPreference() {
  try {
    const value = localStorage.getItem(storageKey)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function useTheme() {
  const preference = ref(savedPreference())
  const query = window.matchMedia?.('(prefers-color-scheme: dark)')
  const systemDark = ref(query?.matches === true)
  const theme = computed(() => preference.value === 'system'
    ? (systemDark.value ? 'dark' : 'light')
    : preference.value)
  const updateSystemTheme = event => { systemDark.value = event.matches }

  onMounted(() => {
    if (query?.addEventListener) query.addEventListener('change', updateSystemTheme)
    else query?.addListener?.(updateSystemTheme)
  })
  onBeforeUnmount(() => {
    if (query?.removeEventListener) query.removeEventListener('change', updateSystemTheme)
    else query?.removeListener?.(updateSystemTheme)
  })
  watch(preference, value => {
    try {
      localStorage.setItem(storageKey, value)
    } catch { /* Keep the preference for the current page. */ }
  })

  return { preference, theme }
}
