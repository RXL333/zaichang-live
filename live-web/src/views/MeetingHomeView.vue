<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, ArrowUpRight, CalendarDays, Copy, LockKeyhole, LogIn, Pencil, Plus, Trash2, Video, X } from 'lucide-vue-next'
import { api } from '../api'
import { useUser } from '../stores/user'

const router=useRouter(),user=useUser(),number=ref(''),meetings=ref([]),loading=ref(false),error=ref(''),toast=ref('')
const dialog=ref(''),title=ref(''),password=ref(''),passwordAction=ref('keep'),selected=ref(null),saving=ref(false),formError=ref('')
const today=computed(()=>new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date()))
let requestId=0,toastTimer
function notify(message){toast.value=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.value='',3500)}
async function load(){
  const current=++requestId;error.value=''
  if(!user.current){meetings.value=[];loading.value=false;return}
  loading.value=true
  try{const result=await api('/api/meetings');if(current===requestId)meetings.value=result}
  catch(e){if(current===requestId)error.value=e.message}
  finally{if(current===requestId)loading.value=false}
}
watch(()=>[user.ready,user.current?.id],([ready])=>{if(ready)load()},{immediate:true})
function create(){if(!user.require(create))return;selected.value=null;title.value='';password.value='';formError.value='';dialog.value='create'}
function edit(meeting){selected.value=meeting;title.value=meeting.title;password.value='';passwordAction.value='keep';formError.value='';dialog.value='edit'}
function join(){const value=number.value.trim().replace(/\s/g,'');if(!/^\d{9}$/.test(value)){notify('请输入 9 位会议号');return}router.push(`/join/${value}`)}
async function submit(){
  formError.value='';saving.value=true
  try{
    if(dialog.value==='create'){
      const meeting=await api('/api/meetings',{method:'POST',body:{title:title.value,password:password.value}})
      dialog.value='';router.push(`/join/${meeting.number}`)
    }else{
      await api(`/api/meetings/${selected.value.number}`,{method:'PATCH',body:{title:title.value,passwordAction:passwordAction.value,password:password.value}})
      dialog.value='';await load();notify('会议信息已更新')
    }
  }catch(e){formError.value=e.message}finally{saving.value=false}
}
async function remove(meeting){
  if(!window.confirm(`确定删除“${meeting.title}”？正在进行的会议也会结束。`))return
  try{await api(`/api/meetings/${meeting.number}`,{method:'DELETE'});await load();notify('会议已删除')}catch(e){notify(e.message)}
}
function inviteUrl(value){const base=new URL(import.meta.env.BASE_URL,location.origin);return import.meta.env.VITE_HASH_ROUTER==='true'?`${base.href}#/join/${value}`:`${base.href}join/${value}`}
async function copy(meeting){try{await navigator.clipboard.writeText(inviteUrl(meeting.number));notify('邀请链接已复制')}catch{notify('复制失败，请手动分享会议号')}}
function date(value){return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'short',day:'numeric'}).format(value)}
</script>
<template>
  <main class="meeting-home">
    <div class="home-meta"><span>在场会议 <i></i> 让交流，更有意义</span><span>{{ today }}</span></div>
    <section class="meeting-hero">
      <div class="hero-text"><div class="eyebrow"><span class="eyebrow-dot"></span> 为每一次重要的交流</div><h1>好好见面，<br/><em>从这里开始。</em></h1><p>无论身处何处，随时发起一场清晰、从容的对话。</p><div class="hero-buttons"><button class="meeting-button primary large" @click="create"><Video :size="19"/> 创建会议 <ArrowUpRight :size="17"/></button><span class="hero-or">或</span><form class="join-inline" @submit.prevent="join"><input v-model="number" inputmode="numeric" maxlength="12" aria-label="会议号" placeholder="输入会议号"/><button aria-label="加入会议"><ArrowRight :size="19"/></button></form></div><div class="hero-footnote"><span class="tiny-squares"><i></i><i></i><i></i></span> 连接彼此，让想法发生。</div></div>
      <div class="hero-composition" aria-hidden="true"><div class="composition-label">A SPACE TO<br/>CONNECT <span>↗</span></div><div class="composition-orbit orbit-a"></div><div class="composition-orbit orbit-b"></div><div class="composition-panel"><div class="composition-bar"><span>ZAICHANG / MEET</span><span>● ● ●</span></div><div class="composition-symbol"><span></span><span></span><span></span><span></span></div><div class="composition-bottom"><div>聚在一起<br/><strong>让想法有回应。</strong></div><span>✳</span></div></div><div class="composition-stamp"><span>IN THE<br/>MOMENT</span><strong>◎</strong></div></div>
    </section>
    <section id="meetings" class="my-meetings">
      <div class="section-line"><div><span class="section-index">YOUR SPACE / 你的空间</span><h2>我的会议 <span>·</span></h2><p>管理你创建的会议，随时与他人相聚。</p></div><button class="meeting-button subtle" @click="create"><Plus :size="17"/> 创建会议</button></div>
      <div v-if="!user.ready || loading" class="meeting-empty"><span class="loader"></span><p>正在加载会议…</p></div>
      <div v-else-if="!user.current" class="meeting-empty"><div class="empty-mark"><LockKeyhole :size="23"/></div><div><strong>登录后查看你的会议</strong><p>创建会议，或通过会议号加入他人的会议。</p></div><button class="meeting-button outline" @click="user.openAuth()">登录账号 <ArrowRight :size="16"/></button></div>
      <div v-else-if="error" class="meeting-empty"><div><strong>暂时无法获取会议</strong><p>{{ error }}</p></div><button class="meeting-button outline" @click="load">重试</button></div>
      <div v-else-if="!meetings.length" class="meeting-empty"><div class="empty-mark"><CalendarDays :size="23"/></div><div><strong>还没有创建会议</strong><p>为下一次交流创建一个空间吧。</p></div><button class="meeting-button outline" @click="create">创建会议 <ArrowRight :size="16"/></button></div>
      <div v-else class="meeting-list"><article v-for="meeting in meetings" :key="meeting.id" class="meeting-list-row"><div class="meeting-icon"><Video :size="20"/></div><div class="meeting-list-main"><div class="meeting-list-title">{{ meeting.title }} <span v-if="meeting.status !== 'OPEN'" class="ended-label">已结束</span></div><div class="meeting-list-meta">会议号 {{ meeting.number }} <span>·</span> 创建于 {{ date(meeting.createdAt) }} <span v-if="meeting.hasPassword">· 已设置密码</span></div></div><div class="meeting-row-actions"><button v-if="meeting.status === 'OPEN'" class="meeting-button outline small" @click="router.push(`/join/${meeting.number}`)">进入会议 <ArrowUpRight :size="14"/></button><button class="row-icon" aria-label="复制邀请链接" title="复制邀请链接" @click="copy(meeting)"><Copy :size="16"/></button><button v-if="meeting.status === 'OPEN'" class="row-icon" aria-label="编辑会议" title="编辑会议" @click="edit(meeting)"><Pencil :size="16"/></button><button class="row-icon danger" aria-label="删除会议" title="删除会议" @click="remove(meeting)"><Trash2 :size="16"/></button></div></article></div>
    </section>
    <footer class="meeting-footer"><span>在场会议 <b>·</b> ZAICHANG MEET</span><span>让每个想法，都有相遇的地方。</span></footer>
    <Teleport to="body"><div v-if="dialog" class="modal-backdrop" @click.self="dialog=''" @keydown.esc="dialog=''">
      <section class="modal meeting-dialog" role="dialog" aria-modal="true" aria-labelledby="meeting-dialog-title"><button class="icon-button modal-close" aria-label="关闭" @click="dialog=''"><X :size="20"/></button><span class="section-index">{{ dialog==='create' ? 'NEW MEETING' : 'MEETING SETTINGS' }}</span><h2 id="meeting-dialog-title">{{ dialog==='create' ? '创建会议' : '编辑会议' }}</h2><p class="muted">{{ dialog==='create' ? '设置会议名称，邀请其他人一起加入。' : '修改会议信息，新密码对之后加入的成员生效。' }}</p><form class="form-stack" @submit.prevent="submit"><label>会议名称<input v-model.trim="title" required maxlength="80" placeholder="例如：项目讨论会"/></label><template v-if="dialog==='edit'"><label>会议密码<select v-model="passwordAction"><option value="keep">保持当前设置</option><option value="set">设置新密码</option><option value="remove">取消密码</option></select></label></template><label v-if="dialog==='create' || passwordAction==='set'">{{ dialog==='create' ? '会议密码（选填）' : '新密码' }}<input v-model="password" type="password" maxlength="32" autocomplete="new-password" placeholder="4–32 个字符"/></label><p v-if="formError" class="form-error" role="alert">{{ formError }}</p><button class="meeting-button primary full" :disabled="saving">{{ saving ? '正在保存…' : dialog==='create' ? '创建并进入' : '保存修改' }} <ArrowRight :size="17"/></button></form></section>
    </div></Teleport>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </main>
</template>
