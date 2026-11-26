<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ArrowRight, Copy } from 'lucide-vue-next'
import { api } from '../api'
import { groupNumber } from '../format'
import LogoMark from '../components/LogoMark.vue'

const route=useRoute(),number=String(route.params.number || '')
const state=typeof history !== 'undefined' ? history.state || {} : {}
const title=typeof state.meetingTitle==='string' ? state.meetingTitle.slice(0,80) : ''
const elapsed=Number.isFinite(state.elapsedSeconds) ? Math.max(0,Math.floor(state.elapsedSeconds)) : null
const unanswered=typeof state.unanswered==='string' ? state.unanswered : ''
const count=value=>Number.isFinite(value) ? Math.max(0,Math.floor(value)) : null
const participants=count(state.participants),chatCount=count(state.chatCount)
const summary=[participants!==null && participants>0 ? `${participants} 人参会` : '',chatCount!==null ? `${chatCount} 条聊天` : ''].filter(Boolean).join('，')
const copyStatus=ref('')
const status=ref(state.meetingEnded ? 'ended' : 'loading')
const duration=computed(()=>elapsed===null ? '' : `${Math.floor(elapsed/60)} 分 ${elapsed%60} 秒`)
async function check(){
  status.value='loading'
  try { const meeting=await api(`/api/meetings/${number}`);status.value=meeting.status==='OPEN' ? 'open' : 'ended' }
  catch(e){status.value=e.status===404 ? 'ended' : 'error'}
}
onMounted(()=>{if(status.value==='loading')check()})
async function copyUnanswered(){
  try{await navigator.clipboard.writeText(unanswered);copyStatus.value='未回答问题已复制'}
  catch{copyStatus.value='请在下方选中文本复制'}
}
</script>
<template>
  <main class="meeting-ended-page">
    <div class="meeting-ended-card">
      <LogoMark /><p class="ended-eyebrow">会议记录</p><h1>{{ status==='ended' ? '会议已结束' : '已离开会议' }}</h1>
      <p>{{ title || '本次会议' }} <span class="meeting-number">{{ groupNumber(number) }}</span></p>
      <p v-if="duration">本次参会时长：{{ duration }}</p>
      <p v-if="summary" class="ended-summary">本次会议：{{ summary }}</p>
      <p v-if="status==='loading'">正在确认会议状态…</p>
      <p v-if="status==='error'">暂时无法确认会议状态，请稍后重试。</p>
      <details v-if="status==='ended' && unanswered" class="ended-questions">
        <summary>未回答问题</summary>
        <textarea readonly aria-label="未回答问题" :value="unanswered" rows="5"></textarea>
        <button class="meeting-button outline" @click="copyUnanswered"><Copy :size="15"/> 复制列表</button>
        <p role="status">{{ copyStatus }}</p>
      </details>
      <div class="ended-actions"><RouterLink class="meeting-button outline" to="/"><ArrowLeft :size="16"/> 返回首页</RouterLink><RouterLink v-if="status==='open'" class="meeting-button primary" :to="`/join/${number}`">重新加入 <ArrowRight :size="16"/></RouterLink><button v-if="status==='error'" class="meeting-button primary" @click="check">重试</button></div>
    </div>
  </main>
</template>
