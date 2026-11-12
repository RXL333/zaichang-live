<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Room, RoomEvent, Track } from 'livekit-client'
import { ArrowLeft, ArrowRight, Check, Copy, LogOut, MessageSquare, Mic, MicOff, MonitorUp, MoreHorizontal, Send, Settings2, Users, Video, VideoOff } from 'lucide-vue-next'
import { api } from '../api'
import { createMeetingSocket } from '../meetingSocket'
import { useUser } from '../stores/user'
import MeetingMedia from '../components/MeetingMedia.vue'
import LogoMark from '../components/LogoMark.vue'
import { groupNumber } from '../format'
import { mediaError as explainMediaError, requestError } from '../mediaErrors'
import ModalDialog from '../components/ModalDialog.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const route=useRoute(),router=useRouter(),user=useUser(),number=route.params.number
const meeting=ref(null),loading=ref(true),fatal=ref(''),notice=ref(''),connection=ref('connecting'),mediaState=ref('connecting'),mediaError=ref('')
const room=shallowRef(null),members=ref([]),messages=ref([]),pending=ref([]),draft=ref(''),panel=ref('members'),menu=ref(''),renameTarget=ref(null),renameValue=ref('')
const camera=ref(false),microphone=ref(false),sharing=ref(false),deviceBusy=ref(false),obsDialog=ref(false),obsInfo=ref(null),obsLoading=ref(false),showKey=ref(false),chatList=ref(null),mediaRevision=ref(0)
const confirmKind=ref(''),confirmTarget=ref(null),confirmBusy=ref(false)
let socket,leaving=false,mediaGeneration=0,noticeTimer
const isHost=computed(()=>meeting.value?.isOwner===true)
const localMember=computed(()=>members.value.find(member=>member.userId===user.current?.id))
const connectionText=computed(()=>({connected:'连接正常',connecting:'正在连接',reconnecting:'正在重连',expired:'请重新加入',closed:'已断开'})[connection.value]||'连接中')
const memberMedia=computed(()=>{
  mediaRevision.value
  const result={};if(!room.value || mediaState.value!=='connected')return result
  for(const person of [room.value.localParticipant,...room.value.remoteParticipants.values()]){
    const uid=person.identity?.split('.')[1];if(!uid)continue
    const current=result[uid] ||= {publishing:false,microphone:false}
    for(const publication of person.trackPublications.values())if(!publication.isMuted){
      current.publishing=true
      if(publication.kind===Track.Kind.Audio && (person.identity.startsWith('obs.') || publication.source===Track.Source.Microphone))current.microphone=true
    }
  }
  return result
})
function flash(value){notice.value=value;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.value='',4500)}
function inviteUrl(){const base=new URL(import.meta.env.BASE_URL,location.origin);return import.meta.env.VITE_HASH_ROUTER==='true'?`${base.href}#/join/${number}`:`${base.href}join/${number}`}
async function copy(value,message='已复制'){try{await navigator.clipboard.writeText(value);flash(message)}catch{flash('复制失败，请手动选择内容复制')}}
function addMessage(message){if(!message?.id || messages.value.some(item=>item.id===message.id))return;messages.value.push(message);messages.value.sort((a,b)=>a.seq-b.seq);nextTick(()=>{if(chatList.value)chatList.value.scrollTop=chatList.value.scrollHeight})}
async function history(){try{const rows=await api(`/api/meetings/${number}/messages`);for(const row of rows)addMessage(row)}catch(e){flash(requestError(e))}}
function handleEvent(event){
  if(event.type==='MEMBERS')members.value=event.members||[]
  if(event.type==='CHAT' || event.type==='CHAT_ACK'){addMessage(event);pending.value=pending.value.filter(item=>item.client_id!==event.client_id)}
  if(event.type==='MUTED'){microphone.value=false;flash(event.message)}
  if(event.type==='NOTICE')flash(event.message)
  if(event.type==='ERROR'){
    if(event.code===429){const failed=pending.value.find(item=>!item.failed);if(failed)failed.failed=true}
    flash(event.message);if(connection.value==='expired'){fatal.value=event.message;room.value?.disconnect()}
  }
  if(event.type==='KICKED' || event.type==='ENDED'){leaving=true;fatal.value=event.message;room.value?.disconnect();room.value=null}
}
function connectSocket(){
  socket=createMeetingSocket({number,onState:value=>connection.value=value,onEvent:handleEvent,onJoined:async()=>{
    await history();for(const item of pending.value.filter(item=>!item.failed))socket?.send({type:'CHAT',clientId:item.client_id,content:item.content})
  }})
}
async function connectMedia(){
  const generation=++mediaGeneration;mediaState.value='connecting';mediaError.value=''
  const previous=room.value;room.value=null;await previous?.disconnect()
  try{
    const credentials=await api(`/api/meetings/${number}/media-token`,{method:'POST'})
    if(generation!==mediaGeneration)return
    const next=new Room({adaptiveStream:true,dynacast:true})
    next.on(RoomEvent.Reconnecting,()=>{if(generation===mediaGeneration)mediaState.value='reconnecting'})
    next.on(RoomEvent.Reconnected,()=>{if(generation===mediaGeneration){mediaState.value='connected';mediaError.value=''}})
    next.on(RoomEvent.Disconnected,()=>{if(generation===mediaGeneration && !leaving){mediaState.value='error';mediaError.value='音视频连接已断开，请重新连接。';camera.value=false;microphone.value=false;sharing.value=false}})
    const sync=()=>{camera.value=next.localParticipant.isCameraEnabled;microphone.value=next.localParticipant.isMicrophoneEnabled;sharing.value=next.localParticipant.isScreenShareEnabled;mediaRevision.value++}
    for(const event of [RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.TrackPublished,RoomEvent.TrackUnpublished,RoomEvent.TrackSubscribed,RoomEvent.TrackUnsubscribed,RoomEvent.ParticipantConnected,RoomEvent.ParticipantDisconnected,RoomEvent.LocalTrackPublished,RoomEvent.LocalTrackUnpublished])if(event)next.on(event,sync)
    room.value=next;await next.connect(credentials.url,credentials.token)
    if(generation!==mediaGeneration){await next.disconnect();return}mediaState.value='connected';sync()
  }catch(e){if(generation===mediaGeneration){const failed=room.value;room.value=null;await failed?.disconnect();mediaState.value='error';mediaError.value=explainMediaError(e,{operation:'connect'})}}
}
async function load(){
  loading.value=true;fatal.value=''
  try{
    await user.load()
    if(!user.current){router.replace(`/join/${number}`);return}
    meeting.value=await api(`/api/meetings/${number}/state`)
    connectSocket();connectMedia()
  }catch(e){if(e.status===401||e.status===403)router.replace(`/join/${number}`);else fatal.value=requestError(e)}
  finally{loading.value=false}
}
async function device(kind){
  if(!room.value || mediaState.value!=='connected'){flash('请先连接音视频');return}
  deviceBusy.value=true
  try{
    if(kind==='mic'){await room.value.localParticipant.setMicrophoneEnabled(!microphone.value);microphone.value=room.value.localParticipant.isMicrophoneEnabled}
    if(kind==='camera'){await room.value.localParticipant.setCameraEnabled(!camera.value);camera.value=room.value.localParticipant.isCameraEnabled}
    if(kind==='screen'){await room.value.localParticipant.setScreenShareEnabled(!sharing.value,{audio:false});sharing.value=room.value.localParticipant.isScreenShareEnabled}
  }catch(e){const message=explainMediaError(e,{operation:kind});if(message)flash(message)}
  finally{deviceBusy.value=false}
}
function sendChat(){
  const content=draft.value.trim();if(!content || connection.value!=='connected')return
  const clientId=globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  pending.value.push({client_id:clientId,content,nickname:localMember.value?.nickname||meeting.value.nickname,created_at:Date.now()})
  if(socket?.send({type:'CHAT',clientId,content}))draft.value=''
}
function manage(type,target){
  if(type==='KICK'){confirmTarget.value=target;confirmKind.value='kick';return}
  menu.value='';if(!socket?.send({type,userId:target.userId}))flash('连接已断开，请稍后重试')
}
function openRename(member){menu.value='';renameTarget.value=member;renameValue.value=member.nickname}
function rename(){const value=renameValue.value.trim();if(!value)return;if(!socket?.send({type:'RENAME',userId:renameTarget.value.userId,nickname:value}))flash('连接已断开，请稍后重试');renameTarget.value=null}
async function createObs(){obsLoading.value=true;try{obsInfo.value=await api(`/api/meetings/${number}/obs`,{method:'POST'});showKey.value=false}catch(e){flash(requestError(e))}finally{obsLoading.value=false}}
async function stopObs(){obsLoading.value=true;try{await api(`/api/meetings/${number}/obs`,{method:'DELETE'});obsInfo.value=null;flash('OBS 推流已停止')}catch(e){flash(requestError(e))}finally{obsLoading.value=false}}
async function leave(){
  leaving=true;mediaGeneration++;socket?.close()
  try{await api(`/api/meetings/${number}/obs`,{method:'DELETE'})}catch{flash('OBS 推流未能确认关闭，请在 OBS 中停止推流。')}
  await room.value?.disconnect();room.value=null;router.push('/')
}
async function endMeeting(){try{await api(`/api/meetings/${number}/end`,{method:'POST'});leaving=true;socket?.close();await room.value?.disconnect();router.push('/')}catch(e){flash(requestError(e))}}
const confirmation=computed(()=>({
  leave:{title:'离开会议',description:'确定离开当前会议？你可以使用会议号重新加入。',action:'离开会议'},
  end:{title:'结束会议',description:'确定结束本次会议？所有成员将离开会议。',action:'结束会议'},
  kick:{title:'移出成员',description:`确定将“${confirmTarget.value?.nickname || ''}”移出会议？`,action:'移出成员'},
})[confirmKind.value] || {})
async function confirmAction(){
  if(confirmBusy.value)return
  confirmBusy.value=true
  try{
    if(confirmKind.value==='leave')await leave()
    else if(confirmKind.value==='end')await endMeeting()
    else if(confirmKind.value==='kick' && confirmTarget.value){
      if(!socket?.send({type:'KICK',userId:confirmTarget.value.userId}))flash('连接已断开，请稍后重试')
      menu.value=''
    }
  }finally{confirmKind.value='';confirmTarget.value=null;confirmBusy.value=false}
}
function time(value){return new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit'}).format(value)}
onMounted(load)
onBeforeUnmount(()=>{leaving=true;mediaGeneration++;clearTimeout(noticeTimer);socket?.close();room.value?.disconnect()})
</script>
<template>
  <main class="conference-page">
    <div v-if="loading" class="conference-full-state"><span class="loader"></span> 正在进入会议…</div>
    <div v-else-if="fatal" class="conference-full-state"><strong>{{ fatal }}</strong><button class="meeting-button outline" @click="router.push('/')">返回首页</button></div>
    <template v-else-if="meeting">
      <header class="conference-header">
        <div class="conference-title">
          <button class="conference-back" aria-label="离开会议并返回首页" @click="confirmKind='leave'"><ArrowLeft :size="19"/></button>
          <LogoMark />
          <div><strong>{{ meeting.title }}</strong><small>{{ groupNumber(number) }}</small></div>
        </div>
        <div class="conference-header-right">
          <span class="connection-status" :class="connection"><i></i><span class="connection-text">{{ connectionText }}</span></span>
          <button class="meeting-button conference-share" aria-label="邀请参会者" @click="copy(inviteUrl(),'邀请链接已复制')"><Copy :size="15"/> <span>邀请</span></button>
          <button v-if="isHost" class="end-meeting" @click="confirmKind='end'">结束会议</button>
          <button class="user-initial" :title="localMember?.nickname || meeting.nickname" aria-label="修改我的昵称" @click="openRename(localMember || {userId:user.current.id,nickname:meeting.nickname})">{{ (localMember?.nickname || meeting.nickname)?.slice(0,1) }}</button>
        </div>
      </header>
      <div class="conference-layout">
        <section class="conference-main">
          <MeetingMedia :room="room" :members="members" :user-id="user.current.id" :media-state="mediaState"/>
          <div v-if="mediaError" class="conference-alert">{{ mediaError }} <button @click="connectMedia">重新连接</button></div>
          <div v-else-if="mediaState==='reconnecting'" class="conference-alert">音视频正在重新连接…</div>
          <div class="conference-toolbar">
            <div class="toolbar-controls">
              <button class="meeting-control" :class="{ enabled:microphone }" :disabled="deviceBusy" @click="device('mic')" :aria-label="microphone ? '关闭麦克风' : '开启麦克风'"><Mic v-if="microphone" :size="20"/><MicOff v-else :size="20"/><span>{{ microphone ? '麦克风' : '麦克风关闭' }}</span></button>
              <button class="meeting-control" :class="{ enabled:camera }" :disabled="deviceBusy" @click="device('camera')" :aria-label="camera ? '关闭摄像头' : '开启摄像头'"><Video v-if="camera" :size="20"/><VideoOff v-else :size="20"/><span>{{ camera ? '摄像头' : '摄像头关闭' }}</span></button>
              <button class="meeting-control" :class="{ enabled:sharing }" :disabled="deviceBusy" @click="device('screen')" :aria-label="sharing ? '停止共享' : '共享屏幕'"><MonitorUp :size="20"/><span>{{ sharing ? '停止共享' : '共享屏幕' }}</span></button>
              <button class="meeting-control" @click="obsDialog=true" aria-label="OBS 推流"><Settings2 :size="20"/><span>OBS</span></button>
              <button class="meeting-control leave-control" @click="confirmKind='leave'"><LogOut :size="20"/><span>离开</span></button>
            </div>
          </div>
        </section>
        <aside class="conference-side">
          <div class="conference-tabs" role="tablist">
            <button role="tab" :aria-selected="panel==='members'" :class="{active:panel==='members'}" @click="panel='members'"><Users :size="16"/> 成员 <span>{{ members.length }}</span></button>
            <button role="tab" :aria-selected="panel==='chat'" :class="{active:panel==='chat'}" @click="panel='chat'"><MessageSquare :size="16"/> 聊天</button>
          </div>
          <div v-if="panel==='members'" class="members-panel">
            <div class="side-caption">{{ connection==='connected' ? `${members.length} 人在会` : connectionText }}</div>
            <div v-for="member in members" :key="member.userId" class="member-row">
              <span class="member-avatar">{{ member.nickname?.slice(0,1) }}</span>
              <div class="member-name"><strong>{{ member.nickname }}{{ member.userId===user.current.id ? '（我）' : '' }}</strong><small>{{ member.host ? '主持人' : '参会者' }} · {{ mediaState==='connected' ? (memberMedia[member.userId]?.publishing ? '推流中' : '未推流') : '音视频未连接' }}</small></div>
              <span class="member-mic" :class="{ on: mediaState==='connected' && memberMedia[member.userId]?.microphone }" :title="mediaState==='connected' ? (memberMedia[member.userId]?.microphone ? '麦克风开' : '麦克风关') : '麦克风状态未知'"><Mic v-if="mediaState==='connected' && memberMedia[member.userId]?.microphone" :size="16"/><MicOff v-else :size="16"/></span>
              <button v-if="isHost && member.userId!==user.current.id" class="member-menu-button" :aria-label="`管理 ${member.nickname}`" @click="menu=menu===member.userId ? '' : member.userId"><MoreHorizontal :size="19"/></button>
              <button v-else-if="member.userId===user.current.id" class="member-menu-button" aria-label="修改我的昵称" @click="openRename(member)"><Settings2 :size="16"/></button>
              <div v-if="menu===member.userId" class="member-popover"><button @click="manage('MUTE',member)">静音</button><button @click="openRename(member)">修改昵称</button><button class="danger-text" @click="manage('KICK',member)">移出会议</button></div>
            </div>
            <div v-if="!members.length" class="panel-empty">正在同步成员…</div>
          </div>
          <template v-else>
            <div ref="chatList" class="conference-chat">
              <div v-if="!messages.length && !pending.length" class="chat-empty"><MessageSquare :size="22"/><strong>还没有消息</strong><span>会议消息只对当前成员可见。</span></div>
              <div v-for="message in messages" :key="message.id" class="conference-message"><div><strong>{{ message.nickname }}</strong><time>{{ time(message.created_at) }}</time></div><p>{{ message.content }}</p></div>
              <div v-for="message in pending" :key="message.client_id" class="conference-message pending"><div><strong>{{ message.nickname }}</strong><time>{{ message.failed ? '未发送，请稍后复制重试' : '发送中' }}</time></div><p>{{ message.content }}</p></div>
            </div>
            <form class="conference-chat-form" @submit.prevent="sendChat"><input v-model="draft" maxlength="1000" :disabled="connection!=='connected'" aria-label="会议消息" placeholder="输入消息…"/><button :disabled="!draft.trim() || connection!=='connected'" aria-label="发送消息"><Send :size="18"/></button></form>
          </template>
        </aside>
      </div>
      <ModalDialog :open="!!renameTarget" labelledby="rename-title" dialog-class="meeting-dialog" @close="renameTarget=null">
        <h2 id="rename-title">修改会议昵称</h2><p class="muted">此昵称只在当前会议中显示。</p><form class="form-stack" @submit.prevent="rename"><label>会议昵称<input v-model.trim="renameValue" maxlength="40" required/></label><button class="meeting-button primary full">保存昵称 <Check :size="17"/></button></form>
      </ModalDialog>
      <ModalDialog :open="obsDialog" labelledby="obs-title" dialog-class="meeting-dialog obs-dialog" @close="obsDialog=false">
        <h2 id="obs-title">通过 OBS 推流</h2><p class="muted">在 OBS 的“设置 → 推流”中选择 WHIP，填入下面的信息。OBS 与浏览器请勿同时采集同一个麦克风，以免产生回声。</p><template v-if="obsInfo"><div class="obs-fields"><label>服务器地址<div><input readonly :value="obsInfo.url"/><button @click="copy(obsInfo.url)" aria-label="复制服务器地址"><Copy :size="16"/></button></div></label><label>Bearer Token<div><input readonly :type="showKey?'text':'password'" :value="obsInfo.streamKey"/><button @click="showKey=!showKey">{{ showKey ? '隐藏' : '显示' }}</button><button @click="copy(obsInfo.streamKey)" aria-label="复制 Token"><Copy :size="16"/></button></div></label></div><p class="obs-note">请勿向他人泄露 Token。重新生成会使原推流地址失效。</p><div class="obs-actions"><button class="meeting-button outline" :disabled="obsLoading" @click="stopObs">停止推流</button><button class="meeting-button primary" :disabled="obsLoading" @click="createObs">重新生成</button></div></template><button v-else class="meeting-button primary full obs-create" :disabled="obsLoading" @click="createObs">{{ obsLoading ? '正在生成…' : '生成推流信息' }} <ArrowRight :size="17"/></button>
      </ModalDialog>
      <ConfirmDialog :open="!!confirmKind" :title="confirmation.title" :description="confirmation.description" :confirm-text="confirmation.action" :busy="confirmBusy" @close="confirmKind=''" @confirm="confirmAction" />
      <div v-if="notice" class="toast" role="status">{{ notice }}</div>
    </template>
  </main>
</template>
