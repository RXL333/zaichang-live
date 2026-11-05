<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Send, Heart, Smile, Gift, ThumbsUp, Mic, Wifi, WifiOff, ChevronDown, Check, X } from 'lucide-vue-next'
import { api } from '../api'
import { createLiveSocket } from '../liveSocket'
import { useUser } from '../stores/user'

const props = defineProps({ roomId: String, sessionId: String, isHost: Boolean, mediaIdentity: String })
const emit = defineEmits(['danmaku', 'reaction', 'accept-mic', 'end-mic', 'viewer-count', 'session-state'])
const user = useUser(), tab = ref('chat'), messageText = ref(''), questionText = ref(''), pollQuestion = ref(''), pollOptions = ref(['', ''])
const messages = ref([]), pending = ref([]), data = ref({ poll: null, questions: [], micRequests: [] }), state = ref('connecting'), connectionCount = ref(null), notice = ref(''), showLab = ref(false), showGifts = ref(false), approved = ref(null), confirming = ref(false), cohosting = ref(false), lastRtt = ref(null), recovered = ref(0)
let socket, lastSeq = 0, pingAt = 0, noticeTimer, recoveryEpoch = 0, syncing = false, backlog = [], deletedDuringRecovery = new Set()
const myMic = computed(() => data.value.micRequests?.find(item => item.user_id === user.current?.id))
const hostRequests = computed(() => data.value.micRequests || [])
function flash(text) { notice.value = text; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.value = '' }, 5000) }
function merge(message, fly = false) {
  if ((message?.user_id || message?.userId) === user.current?.id) {
    const confirmed = pending.value.find(item => item.clientMessageId === (message.client_id || message.clientMessageId))
    if (confirmed) { clearTimeout(confirmed.timer); pending.value = pending.value.filter(item => item !== confirmed) }
  }
  if (!message?.id || messages.value.some(item => item.id === message.id)) return
  if (deletedDuringRecovery.has(message.id)) message = { ...message, content: '', deleted: true }
  messages.value.push(message); messages.value.sort((a, b) => a.seq - b.seq)
  if (messages.value.length > 250) messages.value.splice(0, messages.value.length - 250)
  lastSeq = Math.max(lastSeq, Number(message.seq || 0))
  if (fly && !message.deleted) emit('danmaku', message)
}
async function recover() {
  if (!props.sessionId || syncing) return
  const epoch = recoveryEpoch, session = props.sessionId
  syncing = true
  try {
    let count = 0, fetched = 0, cursor = lastSeq, batch
    do {
      batch = await api(`/api/sessions/${session}/messages?after=${cursor}`)
      if (epoch !== recoveryEpoch) return
      fetched += batch.length
      for (const item of batch) { if (!messages.value.some(m => m.id === item.id)) count++; merge(item); cursor = Math.max(cursor, Number(item.seq)) }
      if (batch.length === 200 && fetched >= 1000) {
        const latest = await api(`/api/sessions/${session}/messages?latest=true`)
        if (epoch !== recoveryEpoch) return
        for (const item of latest) { if (!messages.value.some(m => m.id === item.id)) count++; merge(item) }
        flash('部分较早的消息未加载')
        break
      }
    } while (batch.length === 200)
    recovered.value += count
  } catch (error) { flash(error.message) }
  finally {
    if (epoch === recoveryEpoch) { syncing = false; const buffered = backlog; backlog = []; buffered.forEach(item => merge(item)); deletedDuringRecovery.clear() }
  }
}
async function refresh() {
  if (!props.sessionId) return
  try {
    data.value = await api(`/api/sessions/${props.sessionId}/interactions`)
    const invitation = !cohosting.value && data.value.micRequests?.find(item => item.identity === props.mediaIdentity && item.status === 'APPROVED')
    if (invitation && !approved.value) approved.value = { requestId: invitation.id, identity: invitation.identity }
  } catch { /* A session may have just ended. */ }
}
function receive(event) {
  if (event.sessionId && props.sessionId && event.sessionId !== props.sessionId && event.type !== 'SESSION_STATE') return
  if (event.type === 'SYSTEM' && event.roomId === props.roomId && !event.sessionId) { recover(); refresh() }
  if (event.type === 'PONG' && pingAt) { lastRtt.value = Math.round(performance.now() - pingAt); pingAt = 0 }
  if (event.type === 'USER_COUNT') connectionCount.value = event.count
  if (event.type === 'VIEWER_COUNT') emit('viewer-count', event)
  if (event.type === 'DANMAKU' || event.type === 'DANMAKU_ACK') {
    const mine = pending.value.find(item => item.clientMessageId === event.clientMessageId)
    if (mine) { clearTimeout(mine.timer); pending.value = pending.value.filter(item => item !== mine) }
    if (syncing) backlog.push(event); else merge(event, true)
  }
  if (event.type === 'MESSAGE_DELETED') { if (syncing) deletedDuringRecovery.add(event.messageId); const item = messages.value.find(m => m.id === event.messageId); if (item) { item.deleted = true; item.content = '' } }
  if (event.type === 'REACTION' || event.type === 'GIFT') emit('reaction', event.value)
  if (event.type === 'INTERACTION_CHANGED') refresh()
  if (event.type === 'MIC_APPROVED' && event.identity === props.mediaIdentity) approved.value = event
  if (event.type === 'MIC_CONFIRMED' && event.identity === props.mediaIdentity && approved.value?.requestId === event.requestId) { confirming.value = false; cohosting.value = true; approved.value = null; emit('accept-mic', event.requestId) }
  if (event.type === 'MIC_ENDED' && event.identity === props.mediaIdentity) { confirming.value = false; cohosting.value = false; approved.value = null; emit('end-mic') }
  if (event.type === 'SESSION_STATE') { if (event.status === 'ENDED') flash('直播已结束'); emit('session-state', event) }
  if (event.type === 'ERROR') { confirming.value = false; flash(event.message) }
  if (event.type === 'SYSTEM' && event.sessionId) flash(event.message)
}
function connect() {
  recoveryEpoch++; syncing = false; backlog = []; deletedDuringRecovery.clear(); socket?.close(); messages.value = []; pending.value = []; lastSeq = 0; connectionCount.value = null; approved.value = null; confirming.value = false; cohosting.value = false
  if (!props.roomId) return
  socket = createLiveSocket({ roomId: props.roomId, sessionId: props.sessionId, onMessage: receive, onStateChange(next) { state.value = next; if (next !== 'connected') confirming.value = false } })
}
watch(() => [props.roomId, props.sessionId, user.current?.id], connect, { immediate: true })
onBeforeUnmount(() => { recoveryEpoch++; syncing = false; socket?.close(); clearTimeout(noticeTimer); pending.value.forEach(item => clearTimeout(item.timer)) })
function send(payload) { if (!user.require()) return false; if (!socket?.send(payload)) { flash('互动连接正在恢复，请稍后重试'); return false }; return true }
function sendChat() {
  const content = messageText.value.trim(); if (!content || !user.require()) return
  const item = { clientMessageId: crypto.randomUUID(), content, failed: false }
  if (!send({ type: 'DANMAKU', clientMessageId: item.clientMessageId, content })) return
  messageText.value = ''; pending.value.push(item)
  item.timer = setTimeout(() => { item.failed = true }, 5000)
}
function retry(item) { if (send({ type: 'DANMAKU', clientMessageId: item.clientMessageId, content: item.content })) { item.failed = false; item.timer = setTimeout(() => { item.failed = true }, 5000) } }
function react(type, value) { if (send({ type, value })) showGifts.value = false }
function createPoll() { if (send({ type: 'POLL_CREATE', question: pollQuestion.value, options: pollOptions.value.filter(Boolean) })) { pollQuestion.value = ''; pollOptions.value = ['', ''] } }
function ask() { if (questionText.value.trim() && send({ type: 'QUESTION_ASK', content: questionText.value })) questionText.value = '' }
function acceptMic() { if (approved.value && !confirming.value && send({ type: 'MIC_CONFIRM', requestId: approved.value.requestId })) confirming.value = true }
function declineMic() { if (approved.value) send({ type: 'MIC_END', requestId: approved.value.requestId }); approved.value = null }
function ping() { pingAt = performance.now(); if (!socket?.send({ type: 'PING' })) { pingAt = 0; flash('互动连接还未建立') } }
defineExpose({ endMic: (requestId) => send({ type: 'MIC_END', requestId }) })
</script>
<template>
  <section class="interaction-panel">
    <div class="panel-heading"><div><strong>直播互动</strong><span>LIVE CHAT & MORE</span></div><span class="connection-pill" :class="{ connected: state === 'connected' }"><i></i>{{ state === 'connected' ? '已连接' : '连接中' }}</span></div>
    <div class="panel-tabs" role="tablist"><button :class="{ active: tab === 'chat' }" @click="tab = 'chat'">聊天</button><button :class="{ active: tab === 'questions' }" @click="tab = 'questions'">提问 <span v-if="data.questions?.length">{{ data.questions.length }}</span></button><button :class="{ active: tab === 'poll' }" @click="tab = 'poll'">投票</button></div>
    <div v-if="approved" class="mic-banner"><div><strong>主播邀请你连麦</strong><span>确认后才会请求设备权限</span></div><div><button class="icon-button" aria-label="拒绝连麦" :disabled="confirming" @click="declineMic"><X :size="16" /></button><button class="button button-dark button-small" :disabled="confirming" @click="acceptMic">{{ confirming ? '正在连接…' : '确认连麦' }}</button></div></div>
    <div v-if="tab === 'chat'" class="panel-content chat-content">
      <div class="chat-welcome"><span>✳</span><div><strong>欢迎进入直播间</strong><p>请保持友善，尊重其他观众。</p></div></div>
      <div v-if="!messages.length && !pending.length" class="chat-placeholder">暂无消息</div>
      <div v-for="message in messages" :key="message.id" class="chat-line"><span class="chat-name">{{ message.nickname }}：</span><span>{{ message.deleted ? '该消息已被移除' : message.content }}</span><span v-if="isHost && !message.deleted && message.user_id !== user.current?.id && message.userId !== user.current?.id" class="chat-moderation"><button title="移除消息" @click="send({ type: 'DELETE_MESSAGE', messageId: message.id })">移除</button><button title="禁言 10 分钟" @click="send({ type: 'MUTE', userId: message.user_id || message.userId })">禁言</button></span></div>
      <div v-for="item in pending" :key="item.clientMessageId" class="chat-line pending-line"><span class="chat-name">我：</span>{{ item.content }} <button v-if="item.failed" class="text-link" @click="retry(item)">重试</button><span v-else> · 发送中</span></div>
    </div>
    <div v-else-if="tab === 'questions'" class="panel-content questions-content"><div class="panel-intro"><strong>提问箱</strong><p>向主播提问，或支持感兴趣的问题。</p></div><div v-if="!data.questions?.length" class="panel-empty">暂无提问</div><div v-for="question in data.questions" :key="question.id" class="question-card"><div class="question-meta">{{ question.nickname }} <span v-if="question.status === 'ANSWERED'">已回答</span></div><p>{{ question.content }}</p><div><button class="mini-action" @click="send({ type: 'QUESTION_VOTE', questionId: question.id })"><ThumbsUp :size="14" /> 我也想问 · {{ question.votes }}</button><button v-if="isHost && question.status !== 'ANSWERED'" class="mini-action" @click="send({ type: 'QUESTION_ANSWER', questionId: question.id })">标记已回答</button></div></div><form class="inline-form" @submit.prevent="ask"><input v-model="questionText" maxlength="300" placeholder="输入你的问题" /><button class="button button-dark button-small">提问</button></form></div>
    <div v-else class="panel-content poll-content"><div class="panel-intro"><strong>实时投票</strong><p>参与主播发起的投票。</p></div><div v-if="data.poll" class="poll-card"><span class="poll-status">{{ data.poll.status === 'OPEN' ? '● 进行中' : '已结束' }}</span><h4>{{ data.poll.question }}</h4><button v-for="option in data.poll.options" :key="option.id" class="poll-option" :disabled="data.poll.status !== 'OPEN' || !!data.poll.myVote" @click="send({ type: 'POLL_VOTE', pollId: data.poll.id, optionId: option.id })"><span>{{ option.label }} <Check v-if="data.poll.myVote === option.id" :size="14" /></span><strong>{{ option.votes }} 票</strong></button><button v-if="isHost && data.poll.status === 'OPEN'" class="text-link" @click="send({ type: 'POLL_CLOSE', pollId: data.poll.id })">结束投票</button></div><div v-else class="panel-empty">暂无进行中的投票。</div><form v-if="isHost" class="poll-form" @submit.prevent="createPoll"><label>发起新投票<input v-model.trim="pollQuestion" maxlength="150" required placeholder="写下你的问题" /></label><input v-for="(_, index) in pollOptions" :key="index" v-model.trim="pollOptions[index]" maxlength="100" required :placeholder="`选项 ${index + 1}`" /><button v-if="pollOptions.length < 4" type="button" class="text-link" @click="pollOptions.push('')">+ 添加选项</button><button class="button button-dark button-small">发起投票</button></form></div>
    <div v-if="notice" class="panel-notice" role="status">{{ notice }}</div>
    <div v-if="sessionId" class="interaction-footer">
      <div class="quick-actions"><button @click="react('REACTION', 'heart')"><Heart :size="17" /> 点赞</button><button @click="react('REACTION', 'clap')"><Smile :size="17" /> 鼓掌</button><button @click="showGifts = !showGifts"><Gift :size="17" /> 礼物</button><button v-if="!isHost" :disabled="!mediaIdentity" @click="myMic ? send({ type: 'MIC_END', requestId: myMic.id }) : send({ type: 'MIC_APPLY', identity: mediaIdentity })"><Mic :size="17" /> {{ myMic ? '取消连麦' : '申请连麦' }}</button></div>
      <div v-if="showGifts" class="gift-row"><span>免费赠送</span><button @click="react('GIFT', 'flower')">✿ 鲜花</button><button @click="react('GIFT', 'cookie')">◉ 喝彩</button><button @click="react('GIFT', 'star')">★ 星光</button></div>
      <div v-if="isHost && hostRequests.length" class="mic-requests"><strong>连麦申请</strong><div v-for="request in hostRequests" :key="request.id"><span>{{ request.nickname }} · {{ request.status === 'APPROVED' ? '已同意' : '等待中' }}</span><button v-if="request.status === 'PENDING'" class="text-link" @click="send({ type: 'MIC_APPROVE', requestId: request.id })">同意</button><button class="text-link" @click="send({ type: 'MIC_END', requestId: request.id })">{{ request.status === 'PENDING' ? '拒绝' : '结束' }}</button></div></div>
      <form v-if="tab === 'chat'" class="chat-form" @submit.prevent="sendChat"><input v-model="messageText" maxlength="300" :disabled="state !== 'connected'" placeholder="发送一条弹幕…" aria-label="发送弹幕" /><button :disabled="!messageText.trim() || state !== 'connected'" aria-label="发送"><Send :size="17" /></button></form>
    </div>
    <div class="network-lab"><button @click="showLab = !showLab"><Wifi v-if="state === 'connected'" :size="14" /><WifiOff v-else :size="14" /> 连接状态 <ChevronDown :size="14" :class="{ rotated: showLab }" /></button><div v-if="showLab" class="network-details"><span>互动连接：{{ state === 'connected' ? '已连接' : '恢复中' }}</span><span v-if="isHost">在线互动连接：{{ connectionCount ?? '—' }}</span><span>互动延迟：{{ lastRtt === null ? '—' : `${lastRtt} ms` }}</span><span>已恢复消息：{{ recovered }} 条</span><div><button class="text-link" @click="ping">检测延迟</button></div></div></div>
  </section>
</template>
