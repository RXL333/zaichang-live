<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Room, RoomEvent } from 'livekit-client'
import { ArrowLeft, ArrowRight, Video, VideoOff, Mic, MicOff, MonitorUp, MonitorOff, Radio, Plus, Settings2, AlertCircle } from 'lucide-vue-next'
import { api } from '../api'
import { useUser } from '../stores/user'
import MediaStage from '../components/MediaStage.vue'
import DanmakuLayer from '../components/DanmakuLayer.vue'
import ReactionLayer from '../components/ReactionLayer.vue'
import RoomInteractions from '../components/RoomInteractions.vue'

const route = useRoute(), router = useRouter(), user = useUser()
const rooms = ref([]), room = ref(null), loading = ref(true), busy = ref(false), error = ref(''), notice = ref('')
const title = ref(''), description = ref(''), category = ref('聊天'), coverStyle = ref('tomato'), creating = ref(false)
const preview = ref(null), previewStream = shallowRef(null), mediaRoom = shallowRef(null), sessionId = ref(null), live = ref(false), cameraOn = ref(true), micOn = ref(true), screenOn = ref(false), danmaku = ref(null), reactions = ref(null), devices = ref([]), cameraId = ref(''), micId = ref(''), showDanmaku = ref(true)
const startWithCamera = ref(true), startWithMic = ref(true), deviceBusy = ref(false)
const myRooms = computed(() => rooms.value.filter(item => item.ownerId === user.current?.id))
const hasStartDevice = computed(() => startWithCamera.value || startWithMic.value)
let noticeTimer, disposed = false
function flash(text) { notice.value = text; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => notice.value = '', 5000) }
async function load() {
  loading.value = true; error.value = ''
  try {
    if (!user.ready) await user.load()
    if (!user.current) { loading.value = false; return }
    rooms.value = await api('/api/rooms')
    if (route.params.id) {
      const found = await api(`/api/rooms/${route.params.id}`)
      if (found.ownerId !== user.current.id) throw new Error('这个工作台只对主播开放')
      room.value = found; title.value = found.title; description.value = found.description; category.value = found.category; coverStyle.value = found.coverStyle; sessionId.value = found.sessionId
    }
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}
async function save() {
  busy.value = true; error.value = ''
  try {
    const values = { title: title.value, description: description.value, category: category.value, coverStyle: coverStyle.value }
    const result = await api(room.value ? `/api/rooms/${room.value.id}` : '/api/rooms', { method: room.value ? 'PATCH' : 'POST', body: values })
    if (room.value) { room.value = result; flash('直播间信息已保存') } else { creating.value = false; router.push(`/studio/${result.id}`) }
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
function stopPreview() { previewStream.value?.getTracks().forEach(track => track.stop()); previewStream.value = null }
async function prepareDevices() {
  if (deviceBusy.value || busy.value) return
  error.value = ''
  if (!navigator.mediaDevices?.getUserMedia) { error.value = '当前浏览器无法使用直播设备，请尝试使用 Chrome 或 Edge。'; return }
  if (!hasStartDevice.value) { error.value = '请至少开启摄像头或麦克风。'; return }
  deviceBusy.value = true
  try {
    stopPreview()
    const stream = await navigator.mediaDevices.getUserMedia({ video: startWithCamera.value && (cameraId.value ? { deviceId: { exact: cameraId.value } } : true), audio: startWithMic.value && (micId.value ? { deviceId: { exact: micId.value } } : true) })
    if (disposed) { stream.getTracks().forEach(track => track.stop()); return }
    previewStream.value = stream
    try { devices.value = await navigator.mediaDevices.enumerateDevices() } catch { devices.value = [] }
    if (preview.value) preview.value.srcObject = previewStream.value
  } catch (e) { error.value = '无法打开所选设备，请检查设备连接和浏览器权限。' }
  finally { deviceBusy.value = false }
}
function toggleStartDevice(kind) {
  stopPreview(); error.value = ''
  if (kind === 'camera') startWithCamera.value = !startWithCamera.value
  else startWithMic.value = !startWithMic.value
}
watch(preview, element => { if (element && previewStream.value) element.srcObject = previewStream.value })
async function start() {
  if (!room.value || busy.value || deviceBusy.value) return
  if (!hasStartDevice.value) { error.value = '请至少开启摄像头或麦克风。'; return }
  busy.value = true; error.value = ''
  try {
    const current = await api(`/api/rooms/${room.value.id}/sessions`, { method: 'POST', body: {} }); sessionId.value = current.id
    if (disposed) return
    const credential = await api(`/api/sessions/${current.id}/media-token`, { method: 'POST', body: { role: 'host' } })
    if (disposed) return
    stopPreview()
    cameraOn.value = startWithCamera.value; micOn.value = startWithMic.value
    const connection = new Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: cameraId.value ? { deviceId: cameraId.value } : {}, audioCaptureDefaults: micId.value ? { deviceId: micId.value } : {} })
    mediaRoom.value = connection
    connection.on(RoomEvent.Reconnecting, () => { if (mediaRoom.value === connection) flash('直播连接正在恢复') })
    connection.on(RoomEvent.Reconnected, () => { if (mediaRoom.value === connection) flash('直播连接已恢复') })
    connection.on(RoomEvent.Disconnected, () => {
      if (disposed || mediaRoom.value !== connection) return
      mediaRoom.value = null; live.value = false; screenOn.value = false
      startWithCamera.value = cameraOn.value; startWithMic.value = micOn.value
      if (room.value && sessionId.value) { room.value.status = 'RECONNECTING'; error.value = '直播连接已断开。你可以重新连接，或结束这场直播。' }
    })
    connection.on(RoomEvent.LocalTrackUnpublished, () => { screenOn.value = connection.localParticipant.isScreenShareEnabled })
    await connection.connect(credential.url, credential.token)
    if (disposed || mediaRoom.value !== connection) { await connection.disconnect(); return }
    if (cameraOn.value) await connection.localParticipant.setCameraEnabled(true)
    if (disposed || mediaRoom.value !== connection) { await connection.disconnect(); return }
    if (micOn.value) await connection.localParticipant.setMicrophoneEnabled(true)
    if (disposed || mediaRoom.value !== connection) { await connection.disconnect(); return }
    await api(`/api/sessions/${current.id}/activate`, { method: 'POST', body: {} })
    if (!disposed && mediaRoom.value === connection) { live.value = true; room.value.status = 'LIVE'; flash('直播已开始') }
  } catch (e) { const failed = mediaRoom.value; mediaRoom.value = null; await failed?.disconnect(); if (!disposed) error.value = e.status ? e.message : '暂时无法开播，请检查网络及设备权限后重试。' }
  finally { busy.value = false }
}
async function end() {
  if (!sessionId.value || busy.value) return
  busy.value = true; error.value = ''
  try {
    const result = await api(`/api/sessions/${sessionId.value}/end`, { method: 'POST', body: {} })
    const connection = mediaRoom.value; mediaRoom.value = null; await connection?.disconnect(); stopPreview(); live.value = false; sessionId.value = null; room.value.status = 'OFFLINE'; screenOn.value = false; error.value = ''
    flash(result.mediaClosed ? '这场直播已结束' : '直播已结束，连接清理尚未确认')
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
async function toggleCamera() { try { await mediaRoom.value.localParticipant.setCameraEnabled(!cameraOn.value); cameraOn.value = !cameraOn.value } catch (e) { flash('摄像头切换失败，请检查设备权限') } }
async function toggleMic() { try { await mediaRoom.value.localParticipant.setMicrophoneEnabled(!micOn.value); micOn.value = !micOn.value } catch (e) { flash('麦克风切换失败，请检查设备权限') } }
async function toggleScreen() { try { await mediaRoom.value.localParticipant.setScreenShareEnabled(!screenOn.value); screenOn.value = mediaRoom.value.localParticipant.isScreenShareEnabled } catch (e) { flash('屏幕共享未开启，请检查浏览器权限') } }
async function switchDevice(kind, id) { try { if (live.value) await mediaRoom.value?.switchActiveDevice(kind, id); else if (previewStream.value) await prepareDevices() } catch (e) { flash('设备切换失败，请重试') } }
onMounted(load)
watch(() => user.current?.id, (next, old) => { if (next && !old) load() })
onBeforeUnmount(() => { disposed = true; clearTimeout(noticeTimer); stopPreview(); mediaRoom.value?.disconnect() })
</script>
<template>
  <div class="studio-page"><RouterLink to="/" class="back-link"><ArrowLeft :size="16" /> 回到发现页</RouterLink><div class="studio-header"><div><span class="section-kicker">CREATOR STUDIO <span>✳</span></span><h1>主播工作台<span class="heading-period">.</span></h1><p>管理直播设置、设备和互动。</p></div><span class="studio-badge"><i></i>{{ live ? '正在直播' : '准备中' }}</span></div>
    <div v-if="error" class="studio-error" role="alert"><AlertCircle :size="17" /> {{ error }}</div>
    <div v-if="loading" class="loading-state"><span class="loader"></span> 正在准备工作台…</div>
    <div v-else-if="!user.current" class="empty-state"><div class="empty-icon"><Radio :size="25" /></div><div><span class="empty-kicker">CREATOR STUDIO</span><h3>登录后进入主播工作台</h3><p>登录后创建直播间并管理直播。</p><button class="button button-dark" @click="user.openAuth()">登录 / 注册 <ArrowRight :size="16" /></button></div></div>
    <template v-else-if="!room"><div class="studio-intro"><div><span class="empty-kicker">YOUR CHANNEL</span><h2>创建直播间，<br />开始你的分享。</h2><p>设置标题、分类和封面后即可开始直播。</p><button class="button button-primary" @click="creating = !creating"><Plus :size="18" /> 创建直播间</button></div><div class="studio-intro-art">✳<span>ON AIR<br />YOUR WAY.</span></div></div><div v-if="myRooms.length" class="my-room-list"><div class="subsection-heading"><div>我的直播间</div><span>{{ myRooms.length }} 个空间</span></div><button v-for="item in myRooms" :key="item.id" class="my-room-row" @click="router.push(`/studio/${item.id}`)"><span class="room-mini-cover" :class="`cover-${item.coverStyle}`">✳</span><span><strong>{{ item.title }}</strong><small>{{ item.category }} · {{ item.status === 'LIVE' ? '直播中' : '未开播' }}</small></span><ArrowRight :size="18" /></button></div></template>
    <template v-else><div class="studio-layout"><div class="studio-main"><div class="preview-card"><div class="preview-header"><div><strong>直播预览</strong><span>PREVIEW</span></div><span class="preview-status">{{ live ? '● 直播中' : '仅本地预览，尚未开播' }}</span></div><div v-if="!live" class="local-preview"><video v-if="previewStream && startWithCamera" ref="preview" autoplay muted playsinline></video><div v-if="previewStream && !startWithCamera" class="stage-empty"><div class="stage-icon"><Mic :size="27" /></div><strong>麦克风已就绪</strong><span>本场直播不开启摄像头。</span></div><div v-if="!previewStream" class="stage-empty"><div class="stage-icon"><Video :size="27" /></div><strong>直播预览</strong><span>开播前请检查摄像头和麦克风。</span><button class="button button-cream" @click="prepareDevices">检查设备</button></div></div><MediaStage v-else :room="mediaRoom" :status="'LIVE'" :include-local="true" :danmaku="showDanmaku" @toggle-danmaku="showDanmaku = !showDanmaku; if (!showDanmaku) danmaku?.clear()"><DanmakuLayer v-if="showDanmaku" ref="danmaku" /><ReactionLayer ref="reactions" /></MediaStage><div class="studio-controls"><button v-if="live" class="control-button" :class="{ off: !cameraOn }" @click="toggleCamera"><Video v-if="cameraOn" :size="19" /><VideoOff v-else :size="19" /><span>摄像头</span></button><button v-if="live" class="control-button" :class="{ off: !micOn }" @click="toggleMic"><Mic v-if="micOn" :size="19" /><MicOff v-else :size="19" /><span>麦克风</span></button><button v-if="live" class="control-button" :class="{ active: screenOn }" @click="toggleScreen"><MonitorOff v-if="screenOn" :size="19" /><MonitorUp v-else :size="19" /><span>{{ screenOn ? '停止共享' : '屏幕共享' }}</span></button><button v-if="!live" class="control-button" :class="{ off: !startWithCamera }" :aria-pressed="startWithCamera" :disabled="busy || deviceBusy" @click="toggleStartDevice('camera')"><Video v-if="startWithCamera" :size="19" /><VideoOff v-else :size="19" /><span>摄像头</span></button><button v-if="!live" class="control-button" :class="{ off: !startWithMic }" :aria-pressed="startWithMic" :disabled="busy || deviceBusy" @click="toggleStartDevice('mic')"><Mic v-if="startWithMic" :size="19" /><MicOff v-else :size="19" /><span>麦克风</span></button><button v-if="!live" class="control-button" :disabled="busy || deviceBusy || !hasStartDevice" @click="prepareDevices"><Settings2 :size="19" /><span>{{ deviceBusy ? '检查中…' : '检查设备' }}</span></button><span class="controls-spacer"></span><button v-if="!live" class="button button-primary" :disabled="busy || deviceBusy || !hasStartDevice" @click="start">{{ busy ? '正在连接…' : '开始直播' }} <Radio :size="16" /></button><button v-else class="button button-outline" :disabled="busy" @click="end">{{ busy ? '正在结束…' : '结束直播' }}</button></div><div v-if="!live && !hasStartDevice" class="resume-note">请至少开启摄像头或麦克风后再开播。</div><div v-if="sessionId && !live" class="resume-note">发现尚未结束的场次，可重新连接，或结束这场直播。 <button class="text-link" @click="end">结束场次</button></div></div>
      <div class="settings-card"><div class="settings-heading"><div><span class="section-kicker">CHANNEL SETTINGS <span>✳</span></span><h2>直播间设置</h2></div><span>✦</span></div><form class="form-stack" @submit.prevent="save"><label>直播标题<input v-model.trim="title" required maxlength="80" placeholder="今天想和大家分享什么？" /></label><label>直播分类<select v-model="category"><option v-for="item in ['聊天','游戏','音乐','学习','生活','其他']" :key="item">{{ item }}</option></select></label><label>直播简介<textarea v-model="description" maxlength="500" rows="3" placeholder="介绍你的直播内容"></textarea></label><label>封面颜色<div class="cover-picker"><button v-for="style in ['tomato','lime','cream','charcoal']" :key="style" type="button" :class="[`cover-${style}`, { selected: coverStyle === style }]" :aria-label="`选择 ${style} 封面`" @click="coverStyle = style">✳</button></div></label><template v-if="devices.length"><label>摄像头<select v-model="cameraId" @change="switchDevice('videoinput', cameraId)"><option value="">默认摄像头</option><option v-for="device in devices.filter(d => d.kind === 'videoinput')" :key="device.deviceId" :value="device.deviceId">{{ device.label || '摄像头' }}</option></select></label><label>麦克风<select v-model="micId" @change="switchDevice('audioinput', micId)"><option value="">默认麦克风</option><option v-for="device in devices.filter(d => d.kind === 'audioinput')" :key="device.deviceId" :value="device.deviceId">{{ device.label || '麦克风' }}</option></select></label></template><button class="button button-outline" :disabled="busy">保存设置</button></form></div></div><RoomInteractions v-if="live && sessionId" :room-id="room.id" :session-id="sessionId" :is-host="true" @danmaku="danmaku?.add($event)" @reaction="reactions?.add($event)" /><div v-else class="studio-side-empty"><div class="empty-icon"><Radio :size="24" /></div><strong>直播互动</strong><p>开播后，在这里查看聊天、提问和连麦申请。</p></div></div></template>
    <div v-if="notice" class="toast" role="status">{{ notice }}</div>
    <Teleport to="body"><div v-if="creating" class="modal-backdrop" @click.self="creating = false"><section class="modal"><button class="icon-button modal-close" aria-label="关闭" @click="creating = false">×</button><div class="modal-eyebrow">CREATE CHANNEL ✳</div><h2>创建你的直播间</h2><p class="muted">设置直播间信息，后续可以修改。</p><form class="form-stack" @submit.prevent="save"><label>直播间标题<input v-model.trim="title" required maxlength="80" placeholder="输入直播间标题" /></label><label>分类<select v-model="category"><option v-for="item in ['聊天','游戏','音乐','学习','生活','其他']" :key="item">{{ item }}</option></select></label><label>简介<textarea v-model="description" maxlength="500" rows="3" placeholder="介绍直播内容"></textarea></label><p v-if="error" class="form-error">{{ error }}</p><button class="button button-primary button-full" :disabled="busy">{{ busy ? '正在创建…' : '创建直播间' }} <ArrowRight :size="17" /></button></form></section></div></Teleport>
  </div>
</template>
