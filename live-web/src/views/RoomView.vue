<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Room, RoomEvent } from 'livekit-client'
import { ArrowLeft, Heart, Share2, Users, Radio, Video, AlertCircle, RefreshCw } from 'lucide-vue-next'
import { api } from '../api'
import { useUser } from '../stores/user'
import MediaStage from '../components/MediaStage.vue'
import DanmakuLayer from '../components/DanmakuLayer.vue'
import ReactionLayer from '../components/ReactionLayer.vue'
import RoomInteractions from '../components/RoomInteractions.vue'

const route = useRoute(), router = useRouter(), user = useUser()
const room = ref(null), state = ref('loading'), error = ref(''), toast = ref(''), mediaError = ref('')
const mediaRoom = shallowRef(null), mediaIdentity = ref(''), showDanmaku = ref(true), danmaku = ref(null), reactions = ref(null), interaction = ref(null), mediaState = ref('idle')
let generation = 0, toastTimer, viewerUpdated = Date.now(), viewerTimer
const isOwner = computed(() => !!user.current && user.current.id === room.value?.ownerId)
function flash(message) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = '' }, 4500) }
async function load() {
  state.value = 'loading'
  try {
    room.value = await api(`/api/rooms/${route.params.id}`); viewerUpdated = Date.now(); state.value = 'ready'
    await connectMedia()
  } catch (e) { error.value = e.message; state.value = e.status === 404 ? 'missing' : 'error' }
}
async function connectMedia() {
  const current = ++generation
  await mediaRoom.value?.disconnect(); mediaRoom.value = null; mediaIdentity.value = ''; mediaError.value = ''
  if (!room.value?.sessionId || !['LIVE', 'RECONNECTING'].includes(room.value.status)) { mediaState.value = 'idle'; return }
  mediaState.value = 'connecting'
  try {
    const credential = await api(`/api/sessions/${room.value.sessionId}/media-token`, { method: 'POST', body: { role: 'viewer' } })
    if (current !== generation) return
    const connection = new Room({ adaptiveStream: true, dynacast: true })
    connection.on(RoomEvent.Reconnecting, () => { mediaState.value = 'reconnecting' })
    connection.on(RoomEvent.Reconnected, () => { mediaState.value = 'connected' })
    connection.on(RoomEvent.Disconnected, () => { if (current === generation) mediaState.value = 'disconnected' })
    mediaRoom.value = connection
    await connection.connect(credential.url, credential.token)
    if (current !== generation) { await connection.disconnect(); return }
    mediaIdentity.value = credential.identity; mediaState.value = 'connected'
  } catch (e) { if (current === generation) { mediaError.value = '暂时无法播放直播，请检查网络后重试'; mediaState.value = 'error' } }
}
async function follow() {
  if (!user.require()) return
  try { await api(`/api/rooms/${room.value.id}/follow`, { method: room.value.following ? 'DELETE' : 'POST' }); room.value.following = !room.value.following }
  catch (e) { flash(e.message) }
}
async function share() {
  try { await navigator.clipboard.writeText(location.href); flash('直播间链接已复制') }
  catch { flash('复制失败，可以直接复制地址栏中的链接') }
}
async function sessionState(event) {
  if (event.status === 'ENDED') { room.value.status = 'OFFLINE'; room.value.sessionId = null; flash('本场直播已结束'); await connectMedia() }
  else if (event.status === 'LIVE' && event.sessionId !== room.value.sessionId) await load()
}
function viewerCount(event) { if (room.value && event.sessionId === room.value.sessionId) { viewerUpdated = Date.now(); room.value.viewerCount = event.count; room.value.status = event.status } }
async function acceptMic(requestId) {
  try {
    if (!mediaRoom.value) throw new Error('请先连接直播画面')
    await mediaRoom.value.localParticipant.setMicrophoneEnabled(true)
    await mediaRoom.value.localParticipant.setCameraEnabled(true)
    flash('已加入连麦')
  } catch (e) {
    await stopMic(); interaction.value?.endMic(requestId)
    flash('连麦未能开始，请检查摄像头和麦克风权限')
  }
}
async function stopMic() {
  try { await mediaRoom.value?.localParticipant.setMicrophoneEnabled(false); await mediaRoom.value?.localParticipant.setCameraEnabled(false) } catch { /* Connection may already be closed. */ }
}
onMounted(() => { load(); viewerTimer = setInterval(() => { if (room.value?.sessionId && Date.now() - viewerUpdated > 30000) room.value.viewerCount = null }, 5000) })
watch(() => user.current?.id, (next, previous) => { if (state.value === 'ready' && next !== previous) connectMedia() })
onBeforeUnmount(() => { generation++; clearTimeout(toastTimer); clearInterval(viewerTimer); mediaRoom.value?.disconnect() })
</script>
<template>
  <div class="room-page">
    <RouterLink to="/" class="back-link"><ArrowLeft :size="16" /> 回到发现页</RouterLink>
    <div v-if="state === 'loading'" class="loading-state"><span class="loader"></span> 正在进入直播间…</div>
    <div v-else-if="state === 'missing' || state === 'error'" class="empty-state"><div class="empty-icon"><AlertCircle :size="25" /></div><div><span class="empty-kicker">CHANNEL UNAVAILABLE</span><h3>{{ state === 'missing' ? '直播间不存在' : '连接暂不可用' }}</h3><p>{{ state === 'missing' ? '请返回直播大厅浏览其他频道。' : error }}</p><button class="button button-dark" @click="state === 'missing' ? router.push('/') : load()">{{ state === 'missing' ? '回到发现页' : '再试一次' }}</button></div></div>
    <template v-else-if="room">
      <div class="room-topline"><div class="room-heading"><div class="avatar medium">{{ room.ownerName?.slice(0, 1) }}</div><div><div class="room-title-row"><span class="live-label" :class="{ offline: room.status !== 'LIVE' }"><i></i>{{ room.status === 'LIVE' ? '直播中' : room.status === 'RECONNECTING' ? '恢复中' : room.status === 'PREPARING' ? '准备中' : '未开播' }}</span><span class="room-category">{{ room.category }}</span></div><h1>{{ room.title }}</h1><p>{{ room.ownerName }} <span>·</span> <Users :size="15" /> {{ room.viewerCount ?? '—' }} 人观看</p></div></div><div class="room-actions"><button v-if="!isOwner" class="button button-outline" @click="follow"><Heart :size="16" :fill="room.following ? 'currentColor' : 'none'" /> {{ room.following ? '已关注' : '关注' }}</button><button v-else class="button button-dark" @click="router.push(`/studio/${room.id}`)"><Video :size="16" /> 主播工作台</button><button class="button button-outline square-button" aria-label="分享直播间" @click="share"><Share2 :size="17" /></button></div></div>
      <div class="watch-layout"><div class="watch-main"><MediaStage :room="mediaRoom" :status="room.status" :include-local="true" :danmaku="showDanmaku" @toggle-danmaku="showDanmaku = !showDanmaku; if (!showDanmaku) danmaku?.clear()"><DanmakuLayer v-if="showDanmaku" ref="danmaku" /><ReactionLayer ref="reactions" /></MediaStage><div v-if="mediaError" class="media-alert"><AlertCircle :size="17" /><span>{{ mediaError }}</span><button class="text-link" @click="connectMedia"><RefreshCw :size="14" /> 重试</button></div><div v-else-if="mediaState === 'reconnecting'" class="media-alert">直播画面正在重新连接。</div><div class="room-about"><div><span class="section-kicker">ABOUT THIS ROOM <span>✳</span></span><h2>关于这个直播间</h2><p>{{ room.description || '主播暂未填写直播简介。' }}</p></div><div class="about-note"><Radio :size="18" /><span>实时分享，<br /><strong>即刻交流。</strong></span></div></div></div><RoomInteractions ref="interaction" :room-id="room.id" :session-id="room.sessionId" :is-host="isOwner" :media-identity="mediaIdentity" @danmaku="danmaku?.add($event)" @reaction="reactions?.add($event)" @accept-mic="acceptMic" @end-mic="stopMic" @viewer-count="viewerCount" @session-state="sessionState" /></div>
    </template>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>
