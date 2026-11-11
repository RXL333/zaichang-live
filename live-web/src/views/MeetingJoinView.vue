<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, LockKeyhole, Mic, Video } from 'lucide-vue-next'
import { api } from '../api'
import { groupNumber } from '../format'
import { useUser } from '../stores/user'

const route=useRoute(),router=useRouter(),user=useUser(),meeting=ref(null),loading=ref(true),joining=ref(false),error=ref(''),joinError=ref(''),nickname=ref(''),password=ref('')
async function load(){loading.value=true;error.value='';try{meeting.value=await api(`/api/meetings/${route.params.number}`)}catch(e){error.value=e.status===404?'没有找到这个会议，请检查会议号。':e.message}finally{loading.value=false}}
watch(()=>user.current?.nickname,name=>{if(name && !nickname.value)nickname.value=name},{immediate:true})
watch(()=>user.current?.id,()=>{if(meeting.value)load()})
async function join(){
  if(!user.require(join))return
  joining.value=true;joinError.value=''
  try{await api(`/api/meetings/${route.params.number}/join`,{method:'POST',body:{nickname:nickname.value||user.current.nickname,password:password.value}});password.value='';router.push(`/meeting/${route.params.number}`)}
  catch(e){joinError.value=e.message}finally{joining.value=false}
}
onMounted(load)
</script>
<template>
  <main class="join-page"><div class="join-container"><RouterLink class="back-link" to="/"><ArrowLeft :size="16"/> 返回首页</RouterLink><div class="join-layout"><div class="join-intro"><h1>{{ meeting?.title || '加入会议' }}</h1><div class="room-number" aria-label="会议号">{{ groupNumber(route.params.number) }}</div><p v-if="meeting" class="join-intro-meta">{{ meeting.ownerName }} 发起的会议</p></div><section class="join-card"><div v-if="loading" class="join-card-state"><span class="loader"></span> 正在查找会议…</div><div v-else-if="error" class="join-card-state"><strong>无法加入会议</strong><p>{{ error }}</p><button class="meeting-button outline" @click="load">重新查找</button></div><template v-else-if="meeting"><h2>确认参会信息</h2><div v-if="meeting.status !== 'OPEN'" class="join-notice">该会议已结束。</div><form v-else class="form-stack join-form" @submit.prevent="join"><label>会议昵称<input v-model.trim="nickname" maxlength="40" :placeholder="user.current?.nickname || '输入参会时显示的名字'"/></label><label v-if="meeting.hasPassword && !meeting.isOwner">会议密码<input v-model="password" type="password" :required="!!user.current" autocomplete="off" placeholder="请输入会议密码"/></label><p v-if="meeting.hasPassword" class="join-security"><LockKeyhole :size="14"/> 此会议已设置密码</p><p v-if="joinError" class="form-error" role="alert">{{ joinError }}</p><button class="meeting-button primary full" :disabled="joining">{{ joining ? '正在加入…' : user.current ? '加入会议' : '登录后加入' }} <ArrowRight :size="17"/></button></form><div class="join-device-note"><Mic :size="16"/><Video :size="16"/><span>加入时不会自动开启摄像头和麦克风。</span></div></template></section></div></div></main>
</template>
