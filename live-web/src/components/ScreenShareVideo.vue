<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Crosshair } from 'lucide-vue-next'
import MediaTile from './MediaTile.vue'

const props = defineProps({ track: Object, trackSid: String, canPoint: Boolean, points: Array })
const emit = defineEmits(['point'])
const container = ref(null), trigger = ref(null), target = ref(null)
const armed = ref(false), bounds = ref(null)
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
  armed.value = !armed.value
  if (armed.value) nextTick(() => target.value?.focus({ preventScroll: true }))
}

function cancel(event) {
  if (!armed.value) return
  event.stopPropagation()
  armed.value = false
  trigger.value?.focus({ preventScroll: true })
}

function point(event) {
  const rect = event.currentTarget.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return
  // Keyboard activation marks the center. Pointer coordinates use the visible video, excluding the bars.
  const x = event.detail === 0 ? .5 : (event.clientX - rect.left) / rect.width
  const y = event.detail === 0 ? .5 : (event.clientY - rect.top) / rect.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return
  emit('point', { trackSid: props.trackSid, x, y })
  armed.value = false
  if (event.detail === 0) trigger.value?.focus({ preventScroll: true })
}

watch(() => props.track, () => { bounds.value = null; armed.value = false })
watch(() => props.canPoint, value => { if (!value) armed.value = false })
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
})
</script>

<template>
  <div ref="container" class="screen-share-video" @keydown.esc="cancel">
    <MediaTile :track="track" :muted="true" @loadedmetadata="measure" @resize="measure" />
    <div v-if="bounds" class="screen-point-area" :style="bounds">
      <button v-if="armed" ref="target" class="screen-point-target" aria-label="在共享画面中央放置标记"
        @pointerdown.stop @click.stop="point"></button>
      <span v-for="marker in markers" :key="marker.id" aria-hidden="true" class="screen-point-marker"
        :style="{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }"><i></i></span>
    </div>
    <button v-if="canPoint && bounds" ref="trigger" class="screen-point-button" :aria-pressed="armed"
      @pointerdown.stop @click.stop="toggle"><Crosshair :size="16" /> {{ armed ? '点击画面标记 · 取消' : '标记位置' }}</button>
  </div>
</template>
