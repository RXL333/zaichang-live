<script>
const openDialogs = []
let previousOverflow = ''

function registerDialog(entry) {
  if (!openDialogs.length) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  openDialogs.push(entry)
}
function unregisterDialog(entry) {
  const index = openDialogs.indexOf(entry)
  if (index !== -1) openDialogs.splice(index, 1)
  if (!openDialogs.length) document.body.style.overflow = previousOverflow
}
</script>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  open: Boolean,
  labelledby: { type: String, required: true },
  describedby: String,
  dialogClass: String,
  initialFocus: String,
})
const emit = defineEmits(['close'])
const dialog = ref(null)
const entry = { dialog }
let previousFocus = null, registered = false, focusRevision = 0
const focusSelector = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

function focusableElements() {
  return [...(dialog.value?.querySelectorAll(focusSelector) || [])].filter(element =>
    !element.hidden && element.getAttribute('aria-hidden') !== 'true' &&
    !element.closest('[inert]') && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden')
}
function keydown(event) {
  if (openDialogs.at(-1) !== entry) return
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return }
  if (event.key !== 'Tab') return
  const elements = focusableElements(), first = elements[0], last = elements.at(-1)
  if (!first) { event.preventDefault(); dialog.value?.focus(); return }
  if (!dialog.value.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
function release() {
  if (!registered) return
  registered = false
  document.removeEventListener('keydown', keydown)
  unregisterDialog(entry)
  const target = previousFocus
  previousFocus = null
  nextTick(() => {
    const top = openDialogs.at(-1)
    if (target?.isConnected && (!top || top.dialog.value?.contains(target))) target.focus()
  })
}
watch(() => props.open, async open => {
  const revision = ++focusRevision
  if (!open) { release(); return }
  previousFocus = document.activeElement
  registerDialog(entry); registered = true
  document.addEventListener('keydown', keydown)
  await nextTick()
  if (revision !== focusRevision || !props.open || openDialogs.at(-1) !== entry) return
  const target = (props.initialFocus && dialog.value?.querySelector(props.initialFocus)) ||
    dialog.value?.querySelector('input:not([disabled]):not([type="hidden"])') ||
    dialog.value?.querySelector('[data-modal-close]') || focusableElements()[0] || dialog.value
  target?.focus()
}, { immediate: true })
onBeforeUnmount(() => { focusRevision++; release() })
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
      <section ref="dialog" class="modal" :class="dialogClass" role="dialog" aria-modal="true" :aria-labelledby="labelledby" :aria-describedby="describedby" tabindex="-1">
        <button type="button" class="icon-button modal-close" data-modal-close aria-label="关闭" @click="emit('close')"><X :size="20" /></button>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
