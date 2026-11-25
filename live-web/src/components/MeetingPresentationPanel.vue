<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowDown, ArrowRight, ArrowUp, Check, Clock3, Copy, ListOrdered, MonitorUp, Plus, X } from 'lucide-vue-next'
import { formatPresentationTime, unansweredSummary } from '../meetingPresentation'

const props = defineProps({
  state: Object,
  members: { type: Array, required: true },
  userId: String,
  host: Boolean,
  connected: Boolean,
  canShare: Boolean,
  mediaReady: Boolean,
  busy: Boolean,
  compact: Boolean,
  handoffPhase: String,
  handoffNote: String,
  remaining: String,
  overtime: Boolean,
})
const emit = defineEmits(['action', 'takeover', 'copy'])

const section = ref('agenda')
const editing = ref(false), draft = ref([])
const question = ref(''), lastSent = ref(null)
const currentHeading = ref(null)
let requestedSegment
let rowKey = 0

const agenda = computed(() => props.state?.agenda || [])
const agendaKey = computed(() => agenda.value.map(segment => segment.id).join(','))
const current = computed(() => agenda.value.find(segment => segment.id === props.state?.currentId))
const next = computed(() => agenda.value.find(segment => segment.id === props.state?.nextId))
const invited = computed(() => props.state?.invitedId ? next.value : null)
const ownTurn = computed(() => next.value?.presenterId === props.userId)
const ready = computed(() => props.state?.readyIds.includes(next.value?.id))
const upcomingName = computed(() => next.value && name(next.value))
const upcomingOnline = computed(() => props.members.some(member => member.userId === next.value?.presenterId))
const handoffMessage = computed(() => ({
  selecting: '请在浏览器中选择要共享的画面。',
  confirming: '正在接手汇报…',
})[props.handoffPhase] || props.handoffNote || (props.canShare && !props.mediaReady ? '音视频恢复后即可共享。' : ''))
const questions = computed(() => props.state?.questions || [])
const unanswered = computed(() => unansweredSummary(props.state))
const questionGroups = computed(() => agenda.value.map(segment => ({
  segment,
  items: questions.value.filter(item => item.segmentId === segment.id),
})).filter(group => group.items.length))
const paceOptions = [
  { id: 'following', label: '已跟上' },
  { id: 'slower', label: '请慢一点' },
  { id: 'working', label: '还在操作' },
]
const canEdit = computed(() => props.host && (props.state?.editable ?? true))
const validAgenda = computed(() => draft.value.length > 0 && draft.value.every(row =>
  row.title.trim() && row.presenterId && Number.isInteger(row.minutes) && row.minutes >= 1 && row.minutes <= 30))

watch(agendaKey, () => { editing.value = false })
watch(canEdit, allowed => { if (!allowed) editing.value = false })
watch(() => props.state?.currentId, async segmentId => {
  if (!segmentId || segmentId !== requestedSegment) return
  requestedSegment = null
  if (props.compact) return
  await nextTick()
  if (currentHeading.value?.getClientRects().length) currentHeading.value.focus({ preventScroll: true })
})
watch(questions, items => {
  if (lastSent.value && items.some(item => item.id === lastSent.value.id)) {
    if (question.value.trim() === lastSent.value.content) question.value = ''
    lastSent.value = null
  }
})

function name(segment) {
  return props.members.find(member => member.userId === segment.presenterId)?.nickname || segment.presenter
}
function status(segment, index) {
  if (props.state.skippedIds.includes(segment.id)) return '已跳过'
  if (segment.id === props.state.currentId) return '进行中'
  if (segment.id === props.state.invitedId) return '待接手'
  if (props.state.finished || (current.value && index < agenda.value.indexOf(current.value))) return '已完成'
  if (props.state.readyIds.includes(segment.id)) return '已准备'
  return ''
}
function edit() {
  draft.value = agenda.value.map(segment => ({ ...segment, key: ++rowKey }))
  if (!draft.value.length) addSegment()
  editing.value = true
}
function addSegment() {
  draft.value.push({ key: ++rowKey, title: '', presenterId: props.userId, minutes: 5 })
}
function move(index, direction) {
  const [row] = draft.value.splice(index, 1)
  draft.value.splice(index + direction, 0, row)
}
function send(action, fields) {
  if (props.connected) emit('action', { action, ...fields })
}
function takeOver(withScreen) {
  if (props.busy || !props.connected || (withScreen && !props.mediaReady)) return
  requestedSegment = invited.value.id
  emit('takeover', requestedSegment, withScreen)
}
function save() {
  if (validAgenda.value) send('SAVE', { agenda: draft.value.map(({ title, presenterId, minutes }) => ({ title, presenterId, minutes })) })
}
function ask() {
  const content = question.value.trim()
  if (!props.connected || !content || !current.value) return
  const id = lastSent.value?.content === content ? lastSent.value.id : crypto.randomUUID()
  lastSent.value = { id, content }
  send('QUESTION', { segmentId: current.value.id, questionId: id, content })
}
</script>

<template>
  <div class="presentation-content">
    <div v-if="!agenda.length && !editing" class="presentation-empty">
      <span class="presentation-empty-icon"><ListOrdered :size="22" /></span>
      <h2>{{ host ? '安排本场汇报' : '等待安排议程' }}</h2>
      <p>{{ host ? '填写汇报顺序、负责人和限时。' : '主持人安排后，可在此查看顺序和提问。' }}</p>
      <button v-if="host" class="presentation-button primary" :disabled="!connected" @click="edit"><Plus :size="16" /> 新建议程</button>
    </div>
    <form v-else-if="editing" class="presentation-editor" @submit.prevent="save">
      <h2>安排议程</h2>
      <fieldset v-for="(row, index) in draft" :key="row.key">
        <legend>环节 {{ index + 1 }}</legend>
        <label>环节名称<input v-model="row.title" required maxlength="60" placeholder="例如，方案汇报" /></label>
        <div class="presentation-editor-fields">
          <label>汇报人
            <select v-model="row.presenterId" required>
              <option v-if="row.presenter && !members.some(member => member.userId === row.presenterId)" :value="row.presenterId">{{ row.presenter }}（离线）</option>
              <option v-for="member in members" :key="member.userId" :value="member.userId">{{ member.nickname }}</option>
            </select>
          </label>
          <label>限时（分钟）<input v-model.number="row.minutes" required type="number" min="1" max="30" /></label>
        </div>
        <div class="presentation-order">
          <button type="button" :disabled="index === 0" :aria-label="`上移环节 ${index + 1}`" @click="move(index, -1)"><ArrowUp :size="15" /></button>
          <button type="button" :disabled="index === draft.length - 1" :aria-label="`下移环节 ${index + 1}`" @click="move(index, 1)"><ArrowDown :size="15" /></button>
          <button type="button" :disabled="draft.length === 1" :aria-label="`移除环节 ${index + 1}`" @click="draft.splice(index, 1)"><X :size="15" /></button>
        </div>
      </fieldset>
      <button type="button" class="presentation-button" :disabled="draft.length >= 10" @click="addSegment"><Plus :size="15" /> 添加环节</button>
      <div class="presentation-actions">
        <button type="button" class="presentation-button" @click="editing = false">取消</button>
        <button class="presentation-button primary" :disabled="!connected || !validAgenda">保存议程</button>
      </div>
    </form>
    <template v-else>
      <section v-if="invited && ownTurn" :key="'invite-' + invited.id" class="presentation-handoff" aria-label="接力邀请">
        <div class="presentation-handoff-heading">
          <span class="presentation-handoff-icon"><ArrowRight :size="17" aria-hidden="true" /></span>
          <div>
            <span>轮到你汇报了</span>
            <h2>{{ invited.title }}</h2>
          </div>
          <span class="presentation-minutes">{{ invited.minutes }} 分钟</span>
        </div>
        <div class="presentation-actions presentation-takeover">
          <button v-if="canShare" class="presentation-button primary" :aria-disabled="!connected || busy || !mediaReady"
            @click="takeOver(true)"><MonitorUp :size="16" aria-hidden="true" /> 接手并共享</button>
          <button class="presentation-button" :class="{ primary: !canShare }" :aria-disabled="!connected || busy"
            @click="takeOver(false)">{{ canShare ? '直接开始' : '开始汇报' }}</button>
        </div>
        <p role="status" class="presentation-handoff-status">{{ handoffMessage }}</p>
        <button v-if="host" class="presentation-button presentation-skip" :disabled="!connected || busy"
          @click="send('SKIP', { segmentId: invited.id })">跳过此环节</button>
      </section>
      <div v-if="current" :key="current.id" class="presentation-now" :class="{ overtime }">
        <div>
          <span>{{ current.presenterId === userId ? '你正在汇报' : `${name(current)} 正在汇报` }}</span>
          <h2 ref="currentHeading" tabindex="-1">{{ current.title }}</h2>
        </div>
        <span class="presentation-clock" :aria-label="`${overtime ? '超时' : '剩余'} ${remaining}`"><Clock3 :size="14" aria-hidden="true" /> {{ remaining }}</span>
      </div>
      <section v-if="next && !(invited && ownTurn)" class="presentation-next" aria-label="下一位汇报人">
        <div class="presentation-next-heading">
          <div>
            <p>{{ invited ? '等待接手' : '下一位' }} · {{ ownTurn ? '你' : upcomingName }}</p>
            <h2>{{ next.title }}</h2>
          </div>
          <span v-if="!invited && !upcomingOnline" class="presentation-minutes">离线</span>
          <span v-else-if="ready && !invited && !ownTurn" class="presentation-ready"><Check :size="13" aria-hidden="true" /> 已准备</span>
        </div>
        <div v-if="canEdit || host || (ownTurn && !invited)" class="presentation-actions">
          <button v-if="ownTurn && !invited" class="presentation-button" :aria-disabled="!connected || ready" :aria-pressed="ready"
            @click="!ready && send('READY', { segmentId: next.id })">
            <Check :size="15" aria-hidden="true" /> {{ ready ? '准备就绪' : '已准备好' }}
          </button>
          <button v-if="host && !invited" class="presentation-button primary" :disabled="!connected"
            @click="send('INVITE', { segmentId: next.id })">{{ current ? '邀请下一位' : '邀请首位汇报人' }}</button>
          <button v-if="host && invited" class="presentation-button presentation-skip" :disabled="!connected"
            @click="send('SKIP', { segmentId: invited.id })">跳过此环节</button>
          <button v-if="canEdit" class="presentation-button" :disabled="!connected" @click="edit">编辑议程</button>
        </div>
      </section>
      <section v-if="current" class="presentation-pace" aria-label="节奏反馈">
        <strong>节奏反馈</strong>
        <div v-if="state.paceCounts" class="pace-counts">
          <span v-for="option in paceOptions" :key="option.id"><b :key="state.paceCounts[option.id]">{{ state.paceCounts[option.id] }}</b>{{ option.label }}</span>
        </div>
        <div v-if="current.presenterId !== userId" class="pace-options">
          <button v-for="option in paceOptions" :key="option.id" class="presentation-button"
            :aria-pressed="state.ownPace === option.id" :disabled="!connected"
            @click="send('PACE', { segmentId: current.id, value: option.id })">
            <Check v-if="state.ownPace === option.id" :size="13" aria-hidden="true" /> {{ option.label }}
          </button>
        </div>
      </section>
      <div class="presentation-sections" aria-label="汇报内容">
        <button class="presentation-button" :aria-pressed="section === 'agenda'" @click="section = 'agenda'">议程</button>
        <button class="presentation-button" :aria-pressed="section === 'questions'" @click="section = 'questions'">提问 <span v-if="questions.length">· {{ questions.length }}</span></button>
      </div>
      <template v-if="section === 'agenda'">
        <ol class="presentation-agenda">
          <li v-for="(segment, index) in agenda" :key="segment.id"
            :class="{ current: segment.id === state.currentId }" :aria-current="segment.id === state.currentId ? 'step' : undefined">
            <span class="presentation-index">{{ index + 1 }}</span>
            <div>
              <strong>{{ segment.title }}</strong>
              <span>{{ name(segment) }} · {{ segment.minutes }} 分钟</span>
            </div>
            <small v-if="status(segment, index)">{{ status(segment, index) }}</small>
          </li>
        </ol>
        <button v-if="host && !state.finished && !next" class="presentation-button" :disabled="!connected"
          @click="send('FINISH')">结束接力</button>
        <p v-if="state.finished">汇报已结束</p>
      </template>
      <template v-else>
        <form v-if="current && questions.length < 50" class="presentation-question-form" @submit.prevent="ask">
          <label>向「{{ current.title }}」提问<textarea v-model="question" rows="2" maxlength="300" placeholder="写下你的问题" /></label>
          <button class="presentation-button primary" :disabled="!connected || !question.trim()">发送问题</button>
        </form>
        <p v-if="!questions.length" class="presentation-no-questions">暂无问题</p>
        <button v-if="host && unanswered" class="presentation-button" @click="emit('copy', unanswered)"><Copy :size="15" /> 复制未回答问题</button>
        <section v-for="{ segment, items } in questionGroups" :key="segment.id" class="presentation-question-group">
          <h3>{{ segment.title }}</h3>
          <TransitionGroup name="presentation-question" tag="div" class="presentation-question-items">
            <article v-for="item in items" :key="item.id">
              <header><span>{{ item.author }}</span><time title="距会议开始">{{ formatPresentationTime(item.elapsedMs) }}</time></header>
              <p>{{ item.content }}</p>
              <small v-if="item.answered"><Check :size="13" aria-hidden="true" /> 已回答</small>
              <button v-else-if="host" class="presentation-button" :disabled="!connected" @click="send('ANSWER', { questionId: item.id })">标为已回答</button>
            </article>
          </TransitionGroup>
        </section>
      </template>
    </template>
  </div>
</template>
