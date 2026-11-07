<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RoomEvent, Track } from 'livekit-client'
import { Radio, Volume2, VolumeX, Maximize, MessageSquare, MessageSquareOff, LayoutGrid } from 'lucide-vue-next'
import MediaTile from './MediaTile.vue'
const props = defineProps({ room: Object, status: { type: String, default: 'OFFLINE' }, includeLocal: Boolean, danmaku: { type: Boolean, default: true }, controls: { type: Boolean, default: true } })
const emit = defineEmits(['toggle-danmaku'])
const stage = ref(null), videos = ref([]), muted = ref(false), volume = ref(1), audioReady = ref(true), layout = ref('auto')
let audioTracks = [], listeners = []
const ordered = computed(() => [...videos.value].sort((a, b) => Number(b.screen) - Number(a.screen)))
const focusLayout = computed(() => ordered.value.length > 1 && (layout.value === 'focus' || (layout.value === 'auto' && ordered.value[0]?.screen)))
function clearAudio() { for (const { track, element } of audioTracks) { track.detach(element); element.remove() }; audioTracks = [] }
function update() {
  clearAudio(); const result = []; if (!props.room) { videos.value = []; return }
  const participants = [...props.room.remoteParticipants.values()]
  if (props.includeLocal) participants.unshift(props.room.localParticipant)
  for (const participant of participants) {
    for (const publication of participant.trackPublications.values()) {
      const track = publication.track
      if (!track) continue
      if (track.kind === Track.Kind.Video && !publication.isMuted) result.push({ key: publication.trackSid || track.sid, track, name: participant.name || '直播用户', screen: publication.source === Track.Source.ScreenShare, local: participant === props.room.localParticipant })
      if (track.kind === Track.Kind.Audio && participant !== props.room.localParticipant) {
        const element = track.attach(); element.muted = muted.value; element.volume = volume.value; element.autoplay = true; stage.value?.appendChild(element); audioTracks.push({ track, element })
      }
    }
  }
  videos.value = result; audioReady.value = props.room.canPlaybackAudio !== false
}
function listen(room) {
  if (!room) return
  const events = [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.AudioPlaybackStatusChanged]
  listeners = events.map(event => { room.on(event, update); return event }); update()
}
function unlisten(room) { if (room) listeners.forEach(event => room.off(event, update)); listeners = []; clearAudio() }
watch(() => props.room, (next, previous) => { unlisten(previous); listen(next) }, { immediate: true })
watch(muted, value => audioTracks.forEach(({ element }) => { element.muted = value }))
watch(volume, value => { audioTracks.forEach(({ element }) => { element.volume = Number(value) }); if (value > 0) muted.value = false })
async function sound() { muted.value = !muted.value; if (!muted.value) await props.room?.startAudio().catch(() => {}); audioReady.value = props.room?.canPlaybackAudio !== false }
async function startAudio() { await props.room?.startAudio(); audioReady.value = props.room?.canPlaybackAudio !== false }
function fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else stage.value?.requestFullscreen?.() }
function toggleLayout() { layout.value = focusLayout.value ? 'grid' : 'focus' }
onMounted(update)
onBeforeUnmount(() => unlisten(props.room))
</script>
<template>
  <div ref="stage" class="media-stage" :class="{ 'has-video': ordered.length }">
    <div v-if="ordered.length" class="video-grid" :class="{ 'with-focus': focusLayout, 'single-video': ordered.length === 1 }"><div v-for="item in ordered" :key="item.key" class="video-tile" :class="{ 'screen-tile': item.screen }"><MediaTile :track="item.track" muted /><span class="video-name">{{ item.screen ? '屏幕分享 · ' : '' }}{{ item.name }}</span></div></div>
    <div v-else class="stage-empty"><div class="stage-icon"><Radio :size="28" /></div><strong>{{ status === 'RECONNECTING' ? '画面正在恢复中' : status === 'PREPARING' ? '主播正在准备' : status === 'LIVE' ? '正在连接直播画面' : '直播尚未开始' }}</strong><span>{{ status === 'OFFLINE' ? '请稍后访问。' : '请稍候。' }}</span></div>
    <slot />
    <button v-if="!audioReady" class="sound-unlock" @click="startAudio"><Volume2 :size="16" /> 点击开启声音</button>
    <div v-if="controls" class="stage-controls"><button class="stage-control" :aria-label="muted ? '开启声音' : '静音'" @click="sound"><VolumeX v-if="muted" :size="18" /><Volume2 v-else :size="18" /></button><input v-model.number="volume" class="volume-slider" type="range" min="0" max="1" step="0.05" aria-label="音量" /><button class="stage-control" :aria-label="danmaku ? '关闭弹幕' : '开启弹幕'" @click="emit('toggle-danmaku')"><MessageSquare v-if="danmaku" :size="18" /><MessageSquareOff v-else :size="18" /><span>弹幕</span></button><span class="stage-controls-spacer"></span><button v-if="ordered.length > 1" class="stage-control" :aria-label="focusLayout ? '切换为并排布局' : '切换为主画面布局'" @click="toggleLayout"><LayoutGrid :size="18" /><span>布局</span></button><button class="stage-control" aria-label="全屏" @click="fullscreen"><Maximize :size="18" /></button></div>
  </div>
</template>
