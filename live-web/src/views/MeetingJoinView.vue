<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, LockKeyhole, Mic, Video } from 'lucide-vue-next'
import { api } from '../api'
import { groupNumber } from '../format'
import { useUser } from '../stores/user'
import { useServiceHealth } from '../stores/serviceHealth'
import { requestError } from '../mediaErrors'
import { useJoinDevices } from '../devicePreferences'
import DeviceCheck from '../components/DeviceCheck.vue'
import LogoMark from '../components/LogoMark.vue'
import { rememberMeeting } from '../recentMeetings'

const route=useRoute(),router=useRouter(),user=useUser(),service=useServiceHealth(),joinDevices=useJoinDevices()
const meeting=ref(null),loading=ref(true),joining=ref(false),error=ref(''),errorKind=ref(''),joinError=ref(''),nickname=ref(''),password=ref('')
const deviceCheck=ref(null),deviceSelection=ref({microphoneOn:false,cameraOn:false})
let requestId=0
const state=computed(()=>{
  if(service.status==='timeout')return 'service-timeout'
  if(service.status==='starting')return 'service-starting'
  if(service.status!=='ready' || loading.value || !user.ready)return 'loading'
  if(errorKind.value)return errorKind.value
  if(user.loadError)return 'network'
  if(meeting.value?.status!=='OPEN')return 'ended'
  if(meeting.value?.locked===true)return 'locked'
  if(!user.current)return 'login'
  return 'form'
})
async function load(){
  const current=++requestId;loading.value=true;error.value='';errorKind.value=''
  try{const result=await api(`/api/meetings/${route.params.number}`);if(current===requestId)meeting.value=result}
  catch(e){
    if(current!==requestId)return
    errorKind.value=({401:'login',404:'missing',409:'ended',423:'locked'})[e.status] || 'network'
    error.value=requestError(e)
  }finally{if(current===requestId)loading.value=false}
}
watch(()=>user.current?.nickname,name=>{if(name && !nickname.value)nickname.value=name},{immediate:true})
watch(()=>user.current?.id,()=>{if(meeting.value)load()})
watch(()=>service.status,status=>{if(status==='ready')load()},{immediate:true})
async function join(){
  deviceCheck.value?.release()
  if(!user.require(join))return
  joining.value=true;joinError.value=''
  try{
    await api(`/api/meetings/${route.params.number}/join`,{method:'POST',body:{nickname:nickname.value||user.current.nickname,password:password.value}})
    rememberMeeting({number:route.params.number,title:meeting.value?.title})
    joinDevices.prepare(route.params.number,deviceSelection.value);password.value='';router.push(`/meeting/${route.params.number}`)
  }catch(e){
    if(e.status===423)errorKind.value='locked'
    else if(e.status===409)errorKind.value='ended'
    else if(e.status===401)errorKind.value='login'
    else joinError.value=requestError(e)
  }finally{joining.value=false}
}
function retry(){if(user.loadError)user.load();if(service.status==='timeout')service.start();else load()}
</script>

<template>
  <main class="join-page">
    <div class="join-container">
      <RouterLink class="back-link" to="/"><ArrowLeft :size="16"/> 返回首页</RouterLink>
      <div class="join-layout">
        <div class="join-intro">
          <h1>{{ meeting?.title || '加入会议' }}</h1>
          <div class="room-number" aria-label="会议号">{{ groupNumber(route.params.number) }}</div>
          <p v-if="meeting" class="join-intro-meta">{{ meeting.ownerName }} 发起的会议</p>
        </div>
        <section class="join-card">
          <div v-if="state==='loading'" class="join-card-state"><span class="loader"></span> 正在查找会议…</div>
          <div v-else-if="state!=='form'" class="join-card-state" role="status">
            <LogoMark class="join-state-logo" :class="{'join-state-ended':state==='ended'}" />
            <template v-if="state==='service-starting'"><strong>会议服务正在启动</strong><p>正在尝试连接，请稍候。</p><RouterLink class="meeting-button outline" to="/">返回首页</RouterLink></template>
            <template v-else-if="state==='service-timeout'"><strong>会议服务暂未就绪</strong><p>请重试连接后加入会议。</p><button class="meeting-button outline" @click="retry">重试连接</button></template>
            <template v-else-if="state==='missing'"><strong>未找到这个会议</strong><p>请检查会议号，或向主持人重新获取邀请。</p><RouterLink class="meeting-button outline" to="/">重新输入会议号</RouterLink></template>
            <template v-else-if="state==='ended'"><strong>会议已结束</strong><p>请联系主持人获取新的会议信息。</p><RouterLink class="meeting-button outline" to="/">返回首页</RouterLink></template>
            <template v-else-if="state==='locked'"><strong>会议已锁定</strong><p>当前无法加入，请联系主持人。</p><RouterLink class="meeting-button outline" to="/">返回首页</RouterLink></template>
            <template v-else-if="state==='login'"><strong>登录后加入会议</strong><p>请先登录账号，再确认参会信息。</p><button class="meeting-button primary" @click="user.openAuth()">登录账号</button><RouterLink class="text-link" to="/">返回首页</RouterLink></template>
            <template v-else><strong>暂时无法获取会议信息</strong><p>{{ error || '请检查网络后重试。' }}</p><button class="meeting-button outline" @click="retry">重新查找</button></template>
          </div>
          <template v-else>
            <h2>确认参会信息</h2>
            <form class="form-stack join-form" @submit.prevent="join">
              <label>会议昵称<input v-model.trim="nickname" maxlength="40" :placeholder="user.current?.nickname || '输入参会时显示的名字'"/></label>
              <label v-if="meeting.hasPassword && !meeting.isOwner">会议密码<input v-model="password" type="password" required autocomplete="off" placeholder="请输入会议密码"/></label>
              <p v-if="meeting.hasPassword" class="join-security"><LockKeyhole :size="14"/> 此会议已设置密码</p>
              <p v-if="joinError" class="form-error" role="alert">{{ joinError }}</p>
              <button class="meeting-button primary full" :disabled="joining">{{ joining ? '正在加入…' : '加入会议' }} <ArrowRight :size="17"/></button>
            </form>
            <DeviceCheck ref="deviceCheck" @change="deviceSelection=$event"/>
            <div class="join-device-note"><Mic :size="16"/><Video :size="16"/><span>摄像头和麦克风默认关闭，勾选后可在入会时开启。</span></div>
          </template>
        </section>
      </div>
    </div>
  </main>
</template>
