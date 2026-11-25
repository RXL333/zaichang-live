<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Crosshair } from 'lucide-vue-next'
import MediaTile from './MediaTile.vue'

const props = defineProps({ track: Object, trackSid: String, canPoint: Boolean, armed: Boolean, points: Array })
const emit = defineEmits(['point', 'update:armed'])
const container = ref(null), controls = ref(null), trigger = ref(null), target = ref(null)
const bounds = ref(null), preview = ref(null)
const markers = computed(() => props.points?.filter(point => point.trackSid === props.trackSid) || [])
let observer

function measure() {
  const video = container.value?.querySelector('video')
  if (!video?.videoWidth || !video.videoHeight || !video.clientWidth || !video.clientHeight) {
    bounds.value = null
    return
  }
  const scale = Math.min(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight)
  const width = video.videoWidth * scale / video.clientWidth * 100
  const height = video.videoHeight * scale / video.clientHeight * 100
  bounds.value = { width: `${width}%`, height: `${height}%`, left: `${(100 - width) / 2}%`, top: `${(100 - height) / 2}%` }
}

function toggle() {
  if (props.armed) { dismiss(true); return }
  emit('update:armed', true)
  nextTick(() => target.value?.focus({ preventScroll: true }))
}

function dismiss(restoreFocus = false) {
  emit('update:armed', false)
  preview.value = null
  if (restoreFocus) trigger.value?.focus({ preventScroll: true })
}
function cancelWithEscape(event) {
  if (!props.armed) return
  event.stopPropagation()
  event.preventDefault()
  dismiss(true)
}
function cancelOutside(event) {
  if (target.value?.contains(event.target) || controls.value?.contains(event.target)) return
  dismiss()
}

function coordinate(event) {
  const rect = event.currentTarget.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const x = (event.clientX - rect.left) / rect.width
  const y = (event.clientY - rect.top) / rect.height
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null
}
function aim(event) {
  if (event.pointerType === 'mouse') preview.value = coordinate(event)
}
function point(event) {
  const keyboard = event.detail === 0
  const position = keyboard ? { x: .5, y: .5 } : coordinate(event)
  if (!position) return
  emit('point', { trackSid: props.trackSid, ...position })
  dismiss(keyboard)
}
function positionStyle(point) {
  return { left: `${point.x * 100}%`, top: `${point.y * 100}%` }
}

watch(() => props.track, () => { bounds.value = null; if (props.armed) dismiss() })
watch(() => props.canPoint && !!bounds.value, enabled => { if (!enabled && props.armed) dismiss() })
watch(() => props.armed, armed => {
  if (armed) document.addEventListener('pointerdown', cancelOutside, true)
  else {
    document.removeEventListener('pointerdown', cancelOutside, true)
    preview.value = null
  }
})
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(container.value)
  } else window.addEventListener('resize', measure)
  measure()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
  document.removeEventListener('pointerdown', cancelOutside, true)
  if (props.armed) emit('update:armed', false)
})
</script>

<template>
  <div ref="container" class="screen-share-video" @keydown.esc="cancelWithEscape">
    <MediaTile :track="track" :muted="true" @loadedmetadata="measure" @resize="measure" />
    <div v-if="bounds" class="screen-point-area" :style="bounds" :class="{ armed }">
      <button v-if="armed" ref="target" class="screen-point-target" aria-label="在共享画面中央放置标记"
        @pointerdown.stop @pointermove="aim" @pointerleave="preview = null" @pointercancel="preview = null"
        @click.stop="point"></button>
      <span v-if="armed && preview" class="screen-point-preview" aria-hidden="true" :style="positionStyle(preview)"></span>
      <span v-for="marker in markers" :key="marker.id" aria-hidden="true" class="screen-point-marker"
        :class="{ pending: marker.pending }" :style="positionStyle(marker)"><i></i></span>
    </div>
    <div v-if="canPoint && bounds" ref="controls" class="screen-point-controls">
      <button ref="trigger" class="screen-point-button" :aria-pressed="armed"
        @pointerdown.stop @click.stop="toggle"><Crosshair :size="16" aria-hidden="true" /> {{ armed ? '取消标记' : '标记位置' }}</button>
      <Transition name="point-hint"><span v-if="armed" class="screen-point-hint">点一下共享画面</span></Transition>
    </div>
  </div>
</template>
