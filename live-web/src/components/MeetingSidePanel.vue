<script setup>
import { nextTick, ref, useId, watch } from 'vue'
import { MessageSquare, Users } from 'lucide-vue-next'

const props = defineProps({
  tab: { type: String, required: true },
  drawerOpen: Boolean,
  compact: Boolean,
  memberCount: Number,
  unread: Number,
})
const emit = defineEmits(['update:tab', 'close'])
const id = useId()
const membersTab = ref(null), chatTab = ref(null), panel = ref(null)
const dragOffset = ref(0), dragging = ref(false)
let pointer = null
let dragged = false

function focusTab(tab = props.tab) {
  const button = tab === 'members' ? membersTab.value : chatTab.value
  button?.focus({ preventScroll: true })
}

watch(() => props.drawerOpen, open => {
  if (open) focusTab()
  else cancelDrag()
}, { flush: 'post' })

function selectTab(tab) {
  emit('update:tab', tab)
}

function onTabKey(event) {
  const other = props.tab === 'members' ? 'chat' : 'members'
  const tab = ({ ArrowLeft: other, ArrowRight: other, Home: 'members', End: 'chat' })[event.key]
  if (!tab) return
  event.preventDefault()
  selectTab(tab)
  nextTick(() => focusTab(tab))
}

function keepTabInside(event) {
  if (!props.drawerOpen) return
  const buttons = [...panel.value.querySelectorAll('button, input, a[href], [tabindex]')]
    .filter(element => element.tabIndex >= 0 && !element.disabled && element.getClientRects().length)
  const first = buttons[0], last = buttons.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

function startDrag(event) {
  if (!props.drawerOpen || event.button !== 0 || pointer) return
  pointer = { id: event.pointerId, start: event.clientY }
  dragged = false
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function moveDrag(event) {
  if (pointer?.id !== event.pointerId) return
  const distance = event.clientY - pointer.start
  if (Math.abs(distance) > 5) dragged = true
  dragging.value = dragged
  dragOffset.value = Math.max(0, distance)
}

function cancelDrag() {
  pointer = null
  dragOffset.value = 0
  dragging.value = false
}

function finishDrag(event) {
  if (pointer?.id !== event.pointerId) return
  const distance = event.clientY - pointer.start
  if (Math.abs(distance) > 5) dragged = true
  cancelDrag()
  if (distance >= 64) emit('close')
}

function closeFromHandle(event) {
  if (dragged && event.detail !== 0) {
    dragged = false
    return
  }
  emit('close')
}
</script>

<template>
  <Transition name="drawer-shade">
    <div v-if="drawerOpen" class="side-backdrop" aria-hidden="true" @click="emit('close')"></div>
  </Transition>
  <aside id="meeting-side" ref="panel" class="conference-side" aria-label="会议互动"
    :role="drawerOpen ? 'dialog' : undefined" :aria-modal="drawerOpen ? 'true' : undefined"
    :inert="compact && !drawerOpen" :class="{ 'mobile-open': drawerOpen, 'drawer-dragging': dragging }"
    :style="{ '--drawer-offset': `${dragOffset}px` }" @keydown.tab="keepTabInside">
    <button class="drawer-handle" aria-label="关闭互动面板"
      @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="finishDrag"
      @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @click="closeFromHandle"><span></span></button>
    <div class="conference-tabs" :data-tab="tab" role="tablist" aria-label="会议互动栏目" @keydown="onTabKey">
      <button :id="`${id}-members-tab`" ref="membersTab" role="tab" :aria-selected="tab === 'members'"
        :aria-controls="`${id}-members`" :tabindex="tab === 'members' ? 0 : -1" @click="selectTab('members')">
        <Users :size="16" /> 成员 <span>{{ memberCount }}</span>
      </button>
      <button :id="`${id}-chat-tab`" ref="chatTab" role="tab" :aria-selected="tab === 'chat'"
        :aria-controls="`${id}-chat`" :tabindex="tab === 'chat' ? 0 : -1" @click="selectTab('chat')">
        <MessageSquare :size="16" /> 聊天
        <span v-if="unread" :key="unread" class="unread-badge" :aria-label="`${unread} 条未读消息`">{{ unread > 99 ? '99+' : unread }}</span>
      </button>
    </div>
    <section v-show="tab === 'members'" :id="`${id}-members`" role="tabpanel" :aria-labelledby="`${id}-members-tab`"
      class="side-pane members-panel" tabindex="0"><slot name="members" /></section>
    <section v-show="tab === 'chat'" :id="`${id}-chat`" role="tabpanel" :aria-labelledby="`${id}-chat-tab`"
      class="side-pane chat-panel" tabindex="0"><slot name="chat" /></section>
  </aside>
</template>
