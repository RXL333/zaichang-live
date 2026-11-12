<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, CalendarDays, Check, Copy, LockKeyhole, MicOff, MonitorUp, Pencil, Plus, Trash2, Video } from 'lucide-vue-next'
import { api } from '../api'
import { formatNumberInput, groupNumber } from '../format'
import { useUser } from '../stores/user'
import { useServiceHealth } from '../stores/serviceHealth'
import { requestError } from '../mediaErrors'
import ModalDialog from '../components/ModalDialog.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const router=useRouter(),user=useUser(),service=useServiceHealth(),number=ref(''),meetings=ref([]),loading=ref(false),error=ref(''),toast=ref('')
const dialog=ref(''),title=ref(''),password=ref(''),passwordAction=ref('keep'),selected=ref(null),saving=ref(false),formError=ref('')
const removeTarget=ref(null),removing=ref(false)
const reduceMotion=typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const people=[
  {name:'林夏',initial:'林',line:'我先分享一下这周的进展。'},
  {name:'周朗',initial:'周',line:'屏幕大家都能看到吗？'},
  {name:'陈叙',initial:'陈',line:'能看到，数据很清楚。'},
]
const speaker=ref(0),stage=ref(null),shake=ref(false),copiedId=ref('')
const digits=computed(()=>number.value.replace(/\s/g,'').length)
let requestId=0,toastTimer,cycle,copiedTimer
function notify(message){toast.value=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.value='',3500)}
function startCycle(){clearInterval(cycle);if(reduceMotion)return;cycle=setInterval(()=>{speaker.value=(speaker.value+1)%people.length},3000)}
function pickSpeaker(index){speaker.value=index;startCycle()}
function tilt(event){
  if(reduceMotion || event.pointerType!=='mouse' || !stage.value)return
  const box=stage.value.getBoundingClientRect(),x=(event.clientX-box.left)/box.width,y=(event.clientY-box.top)/box.height
  const style=stage.value.style
  style.setProperty('--ry',`${((x-.5)*8).toFixed(2)}deg`);style.setProperty('--rx',`${((.5-y)*6).toFixed(2)}deg`)
  style.setProperty('--gx',`${(x*100).toFixed(1)}%`);style.setProperty('--gy',`${(y*100).toFixed(1)}%`)
  stage.value.classList.add('is-hover')
}
function untilt(){
  const el=stage.value;if(!el)return
  for(const name of ['--rx','--ry','--gx','--gy'])el.style.removeProperty(name)
  el.classList.remove('is-hover')
}
async function load(){
  const current=++requestId;error.value=''
  if(!user.current){meetings.value=[];loading.value=false;return}
  loading.value=true
  try{const result=await api('/api/meetings');if(current===requestId)meetings.value=result}
  catch(e){if(current===requestId)error.value=requestError(e)}
  finally{if(current===requestId)loading.value=false}
}
watch(()=>[user.ready,user.current?.id,service.status],([ready,,status])=>{if(ready && status==='ready')load()},{immediate:true})
onMounted(startCycle)
onBeforeUnmount(()=>{clearInterval(cycle);clearTimeout(toastTimer);clearTimeout(copiedTimer)})
async function create(){
  if(service.status!=='ready'){
    notify('会议服务正在启动，请稍候')
    if(!(await service.start())){notify('会议服务暂未就绪，请重试');return}
  }
  if(!user.ready || user.loadError)await user.load()
  if(!user.require(create))return
  selected.value=null;title.value='';password.value='';formError.value='';dialog.value='create'
}
function edit(meeting){selected.value=meeting;title.value=meeting.title;password.value='';passwordAction.value='keep';formError.value='';dialog.value='edit'}
function onNumberInput(event){const formatted=formatNumberInput(event.target.value);number.value=formatted;event.target.value=formatted}
function join(){
  const value=number.value.trim().replace(/\s/g,'')
  if(!/^\d{9}$/.test(value)){shake.value=false;nextTick(()=>{shake.value=true});notify('请输入 9 位会议号');return}
  router.push(`/join/${value}`)
}
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
  }catch(e){formError.value=requestError(e)}finally{saving.value=false}
}
async function confirmRemove(){
  const meeting=removeTarget.value;if(!meeting || removing.value)return
  removing.value=true
  try{await api(`/api/meetings/${meeting.number}`,{method:'DELETE'});removeTarget.value=null;await load();notify('会议已删除')}catch(e){notify(requestError(e))}
  finally{removing.value=false}
}
function inviteUrl(value){const base=new URL(import.meta.env.BASE_URL,location.origin);return import.meta.env.VITE_HASH_ROUTER==='true'?`${base.href}#/join/${value}`:`${base.href}join/${value}`}
async function copy(meeting){
  try{await navigator.clipboard.writeText(inviteUrl(meeting.number));notify('邀请链接已复制');copiedId.value=meeting.id;clearTimeout(copiedTimer);copiedTimer=setTimeout(()=>copiedId.value='',1800)}
  catch{notify('复制失败，请手动分享会议号')}
}
function date(value){return new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'short',day:'numeric'}).format(value)}
</script>
<template>
  <main class="meeting-home">
    <section class="meeting-hero">
      <div class="hero-text">
        <h1><span class="line rise">你在场，</span><span class="line rise" style="--d:.08s">会议就开始了。</span></h1>
        <p class="rise" style="--d:.2s">创建会议，或输入 9 位会议号加入。进入时默认不开摄像头和麦克风，什么时候打开由你决定。</p>
        <div class="rise" style="--d:.3s"><form class="join-plate" :class="{ complete: digits===9, shake }" @submit.prevent="join" @animationend="shake=false"><input :value="number" @input="onNumberInput" inputmode="numeric" maxlength="11" autocomplete="off" aria-label="会议号" placeholder="000 000 000"/><button>加入会议 <ArrowRight :size="18"/></button><span class="join-progress" :style="{ transform:`scaleX(${digits/9})` }" aria-hidden="true"></span></form></div>
        <div class="hero-create rise" style="--d:.4s"><span>没有会议号？</span><button class="meeting-button outline" @click="create"><Video :size="17"/> 创建会议</button></div>
      </div>
      <div ref="stage" class="hero-stage rise-stage" aria-hidden="true" @pointermove="tilt" @pointerleave="untilt">
        <div class="hero-room">
          <span class="hero-room-count"><i></i>会议画面示意</span>
          <div class="hero-room-grid">
            <div v-for="(person,index) in people" :key="person.name" class="hero-room-tile" :class="{ speaking: speaker===index }" @click="pickSpeaker(index)"><span class="tile-avatar">{{ person.initial }}</span><span class="tile-name"><span>{{ person.name }}</span><span v-if="speaker===index" class="wave"><i></i><i></i><i></i><i></i></span><MicOff v-else class="mic-off" :size="13"/></span></div>
          </div>
          <div :key="speaker" class="hero-chat"><b>示例 · {{ people[speaker].name }}</b><span>{{ people[speaker].line }}</span></div>
        </div>
      </div>
    </section>
    <section class="home-features" aria-label="功能说明">
      <div class="feature"><MicOff :size="20"/><h3>默认静音入会</h3><p>加入时摄像头和麦克风保持关闭，需要时再打开。</p></div>
      <div class="feature"><LockKeyhole :size="20"/><h3>会议密码</h3><p>为会议设置密码，只有知道密码的人才能加入。</p></div>
      <div class="feature"><MonitorUp :size="20"/><h3>屏幕共享与 OBS 推流</h3><p>共享屏幕，或在会议里生成推流信息，把 OBS 的画面送进会议。</p></div>
    </section>
    <section id="meetings" class="my-meetings">
      <div class="section-line"><div><h2>我的会议</h2><p>你创建的会议，可以在这里进入、分享或修改。</p></div><button class="meeting-button subtle" @click="create"><Plus :size="17"/> 创建会议</button></div>
      <div v-if="service.status==='timeout'" class="meeting-empty"><div><strong>会议服务暂未就绪</strong><p>请重试连接后查看你的会议。</p></div><button class="meeting-button outline" @click="service.start()">重试</button></div>
      <div v-else-if="service.status!=='ready' || !user.ready || loading" class="meeting-empty"><span class="loader"></span><p>正在加载会议…</p></div>
      <div v-else-if="!user.current" class="meeting-empty"><div class="empty-mark"><LockKeyhole :size="22"/></div><div><strong>登录后查看你的会议</strong><p>创建会议，或通过会议号加入他人的会议。</p></div><button class="meeting-button outline" @click="user.openAuth()">登录账号 <ArrowRight :size="16"/></button></div>
      <div v-else-if="error" class="meeting-empty"><div><strong>暂时无法获取会议</strong><p>{{ error }}</p></div><button class="meeting-button outline" @click="load">重试</button></div>
      <div v-else-if="!meetings.length" class="meeting-empty"><div class="empty-mark"><CalendarDays :size="22"/></div><div><strong>还没有创建会议</strong><p>创建后，会议会出现在这里。</p></div><button class="meeting-button outline" @click="create">创建会议 <ArrowRight :size="16"/></button></div>
      <div v-else class="meeting-list"><article v-for="meeting in meetings" :key="meeting.id" class="meeting-list-row"><div class="meeting-icon" :class="{ ended: meeting.status !== 'OPEN' }"><Video :size="18"/></div><div class="meeting-list-main"><div class="meeting-list-title"><span>{{ meeting.title }}</span><span v-if="meeting.status !== 'OPEN'" class="ended-label">已结束</span></div><div class="meeting-list-meta"><span class="meeting-number">{{ groupNumber(meeting.number) }}</span><span>创建于 {{ date(meeting.createdAt) }}</span><span v-if="meeting.hasPassword" class="meeting-lock"><LockKeyhole :size="13"/> 已设置密码</span></div></div><div class="meeting-row-actions"><button v-if="meeting.status === 'OPEN'" class="meeting-button outline small" @click="router.push(`/join/${meeting.number}`)">进入会议 <ArrowRight :size="14"/></button><button class="row-icon" :class="{ copied: copiedId===meeting.id }" :aria-label="copiedId===meeting.id ? '已复制' : '复制邀请链接'" title="复制邀请链接" @click="copy(meeting)"><Check v-if="copiedId===meeting.id" :size="16"/><Copy v-else :size="16"/></button><button v-if="meeting.status === 'OPEN'" class="row-icon" aria-label="编辑会议" title="编辑会议" @click="edit(meeting)"><Pencil :size="16"/></button><button class="row-icon danger" aria-label="删除会议" title="删除会议" @click="removeTarget=meeting"><Trash2 :size="16"/></button></div></article></div>
    </section>
    <footer class="meeting-footer">在场会议</footer>
    <ModalDialog :open="!!dialog" labelledby="meeting-dialog-title" dialog-class="meeting-dialog" @close="!saving && (dialog='')">
      <h2 id="meeting-dialog-title">{{ dialog==='create' ? '创建会议' : '编辑会议' }}</h2><p class="muted">{{ dialog==='create' ? '设置会议名称，再把会议号发给要参会的人。' : '修改会议信息，新密码对之后加入的成员生效。' }}</p><form class="form-stack" @submit.prevent="submit"><label>会议名称<input v-model.trim="title" required maxlength="80" placeholder="例如：项目周会"/></label><template v-if="dialog==='edit'"><label>会议密码<select v-model="passwordAction"><option value="keep">保持当前设置</option><option value="set">设置新密码</option><option value="remove">取消密码</option></select></label></template><label v-if="dialog==='create' || passwordAction==='set'">{{ dialog==='create' ? '会议密码（选填）' : '新密码' }}<input v-model="password" type="password" maxlength="32" autocomplete="new-password" placeholder="4–32 个字符"/></label><p v-if="formError" class="form-error" role="alert">{{ formError }}</p><button class="meeting-button primary full" :disabled="saving">{{ saving ? '正在保存…' : dialog==='create' ? '创建并进入' : '保存修改' }} <ArrowRight :size="17"/></button></form>
    </ModalDialog>
    <ConfirmDialog :open="!!removeTarget" title="删除会议" :description="`确定删除“${removeTarget?.title || ''}”？正在进行的会议也会结束。`" confirm-text="删除会议" :busy="removing" @close="removeTarget=null" @confirm="confirmRemove" />
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </main>
</template>
