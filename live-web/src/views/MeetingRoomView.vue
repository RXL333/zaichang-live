<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Room, RoomEvent, Track } from 'livekit-client'
import { ArrowDown, ArrowLeft, ArrowRight, Check, ChevronUp, Clock3, Copy, Keyboard, ListOrdered, LockKeyhole, LockKeyholeOpen, LogOut, MessageSquare, Mic, MicOff, MonitorUp, MoreHorizontal, Send, Settings2, Users, Video, VideoOff } from 'lucide-vue-next'
import { api } from '../api'
import { createMeetingSocket } from '../meetingSocket'
import { useUser } from '../stores/user'
import MeetingMedia from '../components/MeetingMedia.vue'
import MeetingSidePanel from '../components/MeetingSidePanel.vue'
import MeetingPresentationPanel from '../components/MeetingPresentationPanel.vue'
import LogoMark from '../components/LogoMark.vue'
import { groupNumber } from '../format'
import { mediaError as explainMediaError, requestError } from '../mediaErrors'
import ModalDialog from '../components/ModalDialog.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import InviteQr from '../components/InviteQr.vue'
import { invitationText, meetingUrl } from '../invitation'
import { loadDevicePreferences, supportsSpeakerSelection, useJoinDevices } from '../devicePreferences'
import { useMeetingDevices } from '../useMeetingDevices'
import { adjustVideoQuality } from '../networkQuality'
import { avatarStyle } from '../avatarColors'
import { groupChat } from '../chatText'
import { formatPresentationTime, unansweredSummary } from '../meetingPresentation'

const route=useRoute(),router=useRouter(),user=useUser(),number=route.params.number
const joinDevices=useJoinDevices(),initialSelection=joinDevices.consume(number),deviceDefaults=initialSelection || loadDevicePreferences()
const entering = ref(initialSelection !== null)
const meeting=ref(null),loading=ref(true),fatal=ref(''),notice=ref(''),connection=ref('connecting'),mediaState=ref('connecting'),mediaError=ref('')
const announcement=ref('')
const room=shallowRef(null),members=ref([]),messages=ref([]),pending=ref([]),draft=ref(''),panel=ref('members'),menu=ref(''),renameTarget=ref(null),renameValue=ref('')
const camera=ref(false),microphone=ref(false),sharing=ref(false),deviceBusy=ref(false),obsDialog=ref(false),obsInfo=ref(null),obsLoading=ref(false),showKey=ref(false),chatList=ref(null),mediaRevision=ref(0)
const muteFeedback=ref(false)
const confirmKind=ref(''),confirmTarget=ref(null),confirmBusy=ref(false)
const inviteDialog=ref(false)
const shortcutsDialog=ref(false)
const deviceMenu=ref('')
const networkQuality=ref('unknown'),qualityReduced=ref(false)
const sideOpen=ref(false),moreOpen=ref(false),moreButton=ref(null),screenShareSupported=!!navigator.mediaDevices?.getDisplayMedia
const unread=ref(0),waitingMessages=ref(0),narrowScreen=ref(false),peakMembers=ref(0)
watch(()=>members.value.length,count=>{if(count>peakMembers.value)peakMembers.value=count})
const presentationTools=ref(false),presentation=ref(null),points=ref([])
const handoff=shallowRef(null),handoffNote=ref(''),presentationBrief=ref(null)
const presentationNow=ref(0)
const currentSegment=computed(()=>presentation.value?.agenda.find(segment=>segment.id===presentation.value.currentId))
const ownInvitation=computed(()=>presentation.value?.agenda.find(segment=>segment.id===presentation.value.invitedId && segment.presenterId===user.current?.id))
const overtime=computed(()=>!!currentSegment.value && presentationNow.value>=presentation.value.deadline)
const remaining=computed(()=>currentSegment.value ? (overtime.value ? '+' : '')+formatPresentationTime(Math.abs(presentation.value.deadline-presentationNow.value)) : '')
const drawerOpen = computed(() => narrowScreen.value && sideOpen.value)
const chatVisible=computed(()=>panel.value==='chat' && (!narrowScreen.value || drawerOpen.value))
let chatPosition = { top:0, following:true }
let widthQuery
let panelOpener, presentationTimer, handoffTimer, pointTimer, pointId=0
let clockSample={now:0, received:0}
let toolbarTouch = null, toolbarSwiped = false
let socket,leaving=false,mediaGeneration=0,noticeTimer,initialMedia=initialSelection,restoreMedia=null,hostMuteRevision=0
let membersInitialized=false
const pendingTimers=new Map()
const enteredAt=Date.now()
const supportsHostControls = computed(() => typeof meeting.value?.hostUserId === 'string')
const isHost = computed(() => supportsHostControls.value
  ? meeting.value.hostUserId === user.current?.id
  : meeting.value?.isOwner === true)
const locked = computed(() => meeting.value?.locked === true)
const localMember=computed(()=>members.value.find(member=>member.userId===user.current?.id))
const chatMessages=computed(()=>groupChat([...messages.value,...pending.value]))
const connectionText=computed(()=>({connected:'连接正常',connecting:'正在连接',reconnecting:'正在重连',expired:'请重新加入',closed:'已断开'})[connection.value]||'连接中')
const mediaStatusMessage = computed(() => {
  if (mediaError.value) return mediaError.value
  if (mediaState.value === 'reconnecting') return '音视频正在重新连接…'
  if (['poor','lost'].includes(networkQuality.value)) {
    return qualityReduced.value ? '网络不稳定，已请求降低画质。' : '网络不稳定，请检查网络连接。'
  }
  return ''
})
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
function announce(value){announcement.value='';nextTick(()=>{announcement.value=value || ''})}
function flash(value){notice.value=value;announce(value);clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.value='',4500)}
const mediaDevices=useMeetingDevices({room,mediaState,notify:flash,initial:deviceDefaults})
let popoverTrigger = null
function closePopovers(restoreFocus = false) {
  const wasOpen = !!(deviceMenu.value || moreOpen.value || menu.value)
  deviceMenu.value = ''
  moreOpen.value = false
  menu.value = ''
  if (wasOpen && restoreFocus && popoverTrigger?.isConnected) popoverTrigger.focus({ preventScroll:true })
  popoverTrigger = null
  return wasOpen
}
function togglePopover(state, value, event) {
  const wasOpen = state.value === value
  closePopovers()
  if (wasOpen) return
  state.value = value
  popoverTrigger = event.currentTarget
}
function toggleMore(event) { togglePopover(moreOpen, true, event) }
function toggleMember(id, event) { togglePopover(menu, id, event) }
function onOutsidePointer(event) {
  const group = popoverTrigger?.closest('[data-room-popover]')
  if (group && !group.contains(event.target)) closePopovers()
}
function openDeviceMenu(kind, event) {
  togglePopover(deviceMenu, kind, event)
  if (deviceMenu.value) mediaDevices.refresh()
}
async function selectDevice(kind, id) {
  const openMenu = deviceMenu.value
  if (await mediaDevices.choose(kind, id) && deviceMenu.value === openMenu) closePopovers(true)
}
function openPanel(value,event){panelOpener=event?.currentTarget;panel.value=value;sideOpen.value=narrowScreen.value;closePopovers()}
function closePanel(){
  sideOpen.value=false;closePopovers()
  const opener=panelOpener
  const presentationWasOpen=panel.value==='presentation'
  panelOpener=null
  nextTick(()=>{
    if(drawerOpen.value)return
    const trigger=opener?.isConnected ? opener : (presentationWasOpen && presentationBrief.value) || moreButton.value
    trigger?.focus({preventScroll:true})
  })
}
function startToolbarSwipe(event) {
  toolbarSwiped = false
  toolbarTouch = event.pointerType === 'touch' && narrowScreen.value ? { id: event.pointerId, y: event.clientY } : null
}
function finishToolbarSwipe(event) {
  if (toolbarTouch?.id !== event.pointerId) return
  const upward = toolbarTouch.y - event.clientY > 50
  toolbarTouch = null
  if (upward) {
    toolbarSwiped = true
    openPanel('members')
  }
}
function preventSwipeClick(event) {
  if (!toolbarSwiped || event.detail === 0) return
  toolbarSwiped = false
  event.preventDefault()
  event.stopPropagation()
}
const inviteUrl=computed(()=>meetingUrl(number)),inviteText=computed(()=>meeting.value ? invitationText(meeting.value,inviteUrl.value,presentation.value?.agenda) : '')
async function copy(value,message='已复制'){try{await navigator.clipboard.writeText(value);flash(message)}catch{flash('复制失败，请手动选择内容复制')}}
function nearChatBottom(){const list=chatList.value;return !list || list.scrollHeight-list.scrollTop-list.clientHeight<=80}
function scrollChatBottom() {
  if (!chatVisible.value || !chatList.value) return
  chatList.value.scrollTop = chatList.value.scrollHeight
  waitingMessages.value = 0
}
function onChatScroll(){if(chatVisible.value && nearChatBottom())waitingMessages.value=0}
function jumpToLatest() {
  scrollChatBottom()
  chatList.value?.focus({ preventScroll:true })
}
function messageKey(message) {
  return message.client_id ? `${message.user_id}:${message.client_id}` : message.id
}
function addMessage(message,incoming=false){
  if(!message?.id || messages.value.some(item=>item.id===message.id))return
  const following = chatVisible.value ? nearChatBottom() : chatPosition.following
  messages.value.push(message);messages.value.sort((a,b)=>a.seq-b.seq)
  if (incoming && message.user_id !== user.current?.id) {
    if (!chatVisible.value) unread.value++
    if (!following) waitingMessages.value++
    announce(`${message.nickname || '成员'}发来一条消息`)
  }
  if (chatVisible.value && following) nextTick(scrollChatBottom)
}
watch(chatVisible, (visible, wasVisible) => {
  if (!visible && wasVisible && chatList.value) {
    chatPosition = { top:chatList.value.scrollTop, following:nearChatBottom() }
  }
  if (!visible) return
  unread.value = 0
  nextTick(() => {
    if (!chatVisible.value || !chatList.value) return
    if (chatPosition.following) scrollChatBottom()
    else chatList.value.scrollTop = chatPosition.top
  })
})
function clearPendingTimer(id){clearTimeout(pendingTimers.get(id));pendingTimers.delete(id)}
function sendPending(item){
  clearPendingTimer(item.client_id)
  if(!socket?.send({type:'CHAT',clientId:item.client_id,content:item.content})){item.failed=true;return false}
  item.failed=false
  pendingTimers.set(item.client_id,setTimeout(()=>{item.failed=true;pendingTimers.delete(item.client_id)},15000))
  return true
}
function retryMessage(item){if(!item)return;if(connection.value!=='connected'){flash('连接已断开，请稍后重试');return}sendPending(item)}
async function history() {
  try {
    const rows = await api(`/api/meetings/${number}/messages`)
    const present = new Set(messages.value.map(message => message.id))
    const missing = rows.filter(row => {
      if (!row?.id || present.has(row.id)) return false
      present.add(row.id)
      return true
    })
    if (!missing.length) return
    const following = chatVisible.value && nearChatBottom()
    messages.value = [...messages.value, ...missing].sort((a, b) => a.seq - b.seq)
    if (following) nextTick(scrollChatBottom)
  } catch (error) { flash(requestError(error)) }
}
function updatePresentationTime() {
  presentationNow.value=clockSample.now+performance.now()-clockSample.received
}
watch(()=>presentation.value?.deadline, deadline=>{
  clearInterval(presentationTimer)
  if(deadline) presentationTimer=setInterval(updatePresentationTime,200)
})
function receivePresentation(event) {
  const previous=ownInvitation.value?.id
  clockSample={now:event.serverNow, received:performance.now()}
  updatePresentationTime()
  presentation.value=event
  const invited=ownInvitation.value?.id
  if(invited!==previous)handoffNote.value=''
  if(handoff.value?.phase==='confirming'){
    if(event.currentId===handoff.value.segmentId){
      clearHandoff()
      if(drawerOpen.value && panel.value==='presentation')closePanel()
      announce(`已接手「${currentSegment.value.title}」`)
      return
    }
    if(event.invitedId!==handoff.value.segmentId)cancelHandoff()
  }
  if(invited && invited!==previous)announce(`轮到你汇报「${ownInvitation.value.title}」`)
}
function trimPoints() {
  clearTimeout(pointTimer)
  const now=performance.now()
  points.value=points.value.filter(point=>point.expiresAt>now)
  if(points.value.length) {
    const nextExpiry=Math.min(...points.value.map(point=>point.expiresAt))
    pointTimer=setTimeout(trimPoints,Math.max(1,nextExpiry-now))
  }
}
function addPoint(point,pending=false) {
  points.value=[...points.value.slice(-5),{...point,pending,id:++pointId,expiresAt:performance.now()+(pending ? 700 : 2400)}]
  trimPoints()
}
function receivePoint(event) {
  const preview=points.value.find(point=>point.pending && point.trackSid===event.trackSid && point.x===event.x && point.y===event.y)
  if(!preview){addPoint(event);return}
  preview.pending=false
  preview.expiresAt=performance.now()+2400
  trimPoints()
}
function handleEvent(event){
  if(event.type==='JOINED') {
    presentationTools.value=event.presentationTools===true
    if(!presentationTools.value || event.hasPresentation===false) {
      presentation.value=null
      if(handoff.value?.phase==='confirming')cancelHandoff()
      if(!presentationTools.value && panel.value==='presentation')panel.value='members'
    }
  }
  if (event.type === 'JOINED' && typeof event.hostUserId === 'string') {
    meeting.value.hostUserId = event.hostUserId
    meeting.value.locked = event.locked
  }
  if (event.type === 'HOST_CHANGED') {
    meeting.value.hostUserId = event.hostUserId
    if (menu.value) closePopovers()
    flash(isHost.value ? '你已成为主持人' : `${event.nickname} 已成为主持人`)
  }
  if (event.type === 'MEETING_LOCK_CHANGED') {
    meeting.value.locked = event.locked
    flash(event.locked ? '会议已锁定' : '会议已解锁')
  }
  if (event.type === 'MUTE_ALL_RESULT') flash(event.message)
  if(event.type==='MEMBERS'){
    const next=event.members||[]
    if(membersInitialized){
      const before=new Map(members.value.map(member=>[member.userId,member.nickname])),after=new Map(next.map(member=>[member.userId,member.nickname]))
      const joined=next.filter(member=>!before.has(member.userId)),left=members.value.filter(member=>!after.has(member.userId))
      const changes=[joined.length ? `${joined.map(member=>member.nickname).join('、')}加入会议` : '',left.length ? `${left.map(member=>member.nickname).join('、')}离开会议` : ''].filter(Boolean)
      if(changes.length)announce(changes.join('；'))
    }
    members.value=next;membersInitialized=true
  }
  if(event.type==='CHAT' || event.type==='CHAT_ACK'){addMessage(event,event.type==='CHAT');clearPendingTimer(event.client_id);pending.value=pending.value.filter(item=>item.client_id!==event.client_id)}
  if(event.type==='MUTED'){hostMuteRevision++;microphone.value=false;if(initialMedia)initialMedia.microphoneOn=false;if(restoreMedia)restoreMedia.microphoneOn=false;flash(event.message);muteFeedback.value=false;nextTick(()=>muteFeedback.value=true)}
  if(event.type==='NOTICE')flash(event.message)
  if(event.type==='PRESENTATION_STATE')receivePresentation(event)
  if(event.type==='SCREEN_POINT')receivePoint(event)
  if(event.type==='PRESENTATION_ERROR'){
    if(event.action==='ACCEPT' && handoff.value?.phase==='confirming')cancelHandoff(event.message)
    else flash(event.message)
  }
  if(event.type==='ERROR'){
    if(event.code===429){const failed=pending.value.find(item=>!item.failed);if(failed){failed.failed=true;clearPendingTimer(failed.client_id)}}
    flash(event.message);if(connection.value==='expired'){leaving=true;mediaGeneration++;fatal.value=event.message;room.value?.disconnect();room.value=null}
  }
  if(event.type==='KICKED'){leaving=true;mediaGeneration++;fatal.value=event.message;room.value?.disconnect();room.value=null}
  if(event.type==='ENDED' && !leaving){leaving=true;mediaGeneration++;socket?.close();room.value?.disconnect();room.value=null;showEnded(true)}
}
function showEnded(meetingEnded=false){
  const unanswered=meetingEnded && isHost.value ? unansweredSummary(presentation.value) : ''
  router.push({path:`/ended/${number}`,state:{
    meetingTitle:meeting.value?.title || '',elapsedSeconds:Math.max(0,Math.floor((Date.now()-enteredAt)/1000)),meetingEnded,unanswered,
    participants:Math.max(peakMembers.value,members.value.length),chatCount:messages.value.length,
  }})
}
function connectSocket(){
  socket=createMeetingSocket({number,onState:value=>{
    connection.value=value
    if(value!=='connected' && handoff.value?.phase==='confirming')cancelHandoff('连接中断，恢复后可重新接手。')
  },onEvent:handleEvent,onJoined:async()=>{
    await history();for(const item of pending.value.filter(item=>!item.failed))sendPending(item)
  }})
}
async function connectMedia(){
  const generation=++mediaGeneration;mediaState.value='connecting';mediaError.value=''
  const previous=room.value;room.value=null;await previous?.disconnect()
  try{
    const credentials=await api(`/api/meetings/${number}/media-token`,{method:'POST'})
    if(generation!==mediaGeneration)return
    const selectedDevices=mediaDevices.selected
    const next=new Room({adaptiveStream:true,dynacast:true,
      ...(selectedDevices.microphoneId ? {audioCaptureDefaults:{deviceId:selectedDevices.microphoneId}} : {}),
      ...(selectedDevices.cameraId ? {videoCaptureDefaults:{deviceId:selectedDevices.cameraId}} : {}),
      ...(selectedDevices.speakerId && supportsSpeakerSelection() ? {audioOutput:{deviceId:selectedDevices.speakerId}} : {}),
    })
    let hasConnected=false
    next.on(RoomEvent.Reconnecting,()=>{if(generation===mediaGeneration)mediaState.value='reconnecting'})
    const sync=()=>{camera.value=next.localParticipant.isCameraEnabled;microphone.value=next.localParticipant.isMicrophoneEnabled;sharing.value=next.localParticipant.isScreenShareEnabled;mediaRevision.value++}
    const updateQuality=(quality,participant)=>{
      if(generation!==mediaGeneration || (participant && participant!==next.localParticipant))return
      networkQuality.value=quality || 'unknown'
      const poor=['poor','lost'].includes(networkQuality.value)
      qualityReduced.value=adjustVideoQuality(next,poor) && poor
    }
    next.on(RoomEvent.Reconnected,()=>{if(generation===mediaGeneration){mediaState.value='connected';mediaError.value='';sync();updateQuality(next.localParticipant.connectionQuality,next.localParticipant)}})
    next.on(RoomEvent.Disconnected,()=>{if(generation===mediaGeneration && !leaving){
      if(hasConnected)restoreMedia={microphoneOn:microphone.value,cameraOn:camera.value}
      mediaState.value='error';mediaError.value=sharing.value?'音视频连接已断开，重连后请重新共享屏幕。':'音视频连接已断开，请重新连接。'
      camera.value=false;microphone.value=false;sharing.value=false;networkQuality.value='unknown';qualityReduced.value=false
    }})
    next.on(RoomEvent.ConnectionQualityChanged,updateQuality)
    next.on(RoomEvent.TrackSubscribed,()=>{if(['poor','lost'].includes(networkQuality.value))qualityReduced.value=adjustVideoQuality(next,true) || qualityReduced.value})
    for(const event of [RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.TrackPublished,RoomEvent.TrackUnpublished,RoomEvent.TrackSubscribed,RoomEvent.TrackUnsubscribed,RoomEvent.ParticipantConnected,RoomEvent.ParticipantDisconnected,RoomEvent.LocalTrackPublished,RoomEvent.LocalTrackUnpublished])if(event)next.on(event,sync)
    room.value=next;await next.connect(credentials.url,credentials.token)
    if(generation!==mediaGeneration){await next.disconnect();return}hasConnected=true;mediaState.value='connected';sync();updateQuality(next.localParticipant.connectionQuality,next.localParticipant)
    if(initialMedia || restoreMedia){
      const selected=initialMedia || restoreMedia;initialMedia=null;restoreMedia=null;deviceBusy.value=true
      try{
        for(const [enabled,kind] of [[selected.microphoneOn,'mic'],[selected.cameraOn,'camera']]){
          if(!enabled || generation!==mediaGeneration || leaving)continue
          try{
            const muteRevision=hostMuteRevision
            if(kind==='mic')await next.localParticipant.setMicrophoneEnabled(true)
            else await next.localParticipant.setCameraEnabled(true)
            if(kind==='mic' && muteRevision!==hostMuteRevision)await next.localParticipant.setMicrophoneEnabled(false)
            if(generation!==mediaGeneration || leaving){
              if(kind==='mic')await next.localParticipant.setMicrophoneEnabled(false)
              else await next.localParticipant.setCameraEnabled(false)
              await next.disconnect();return
            }
          }catch(error){const message=explainMediaError(error,{operation:kind});if(message)flash(message)}
        }
        if(generation===mediaGeneration)sync()
      }finally{if(generation===mediaGeneration)deviceBusy.value=false}
    }
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
async function device(kind,screenEnabled){
  if(deviceBusy.value)return false
  if(!room.value || mediaState.value!=='connected'){flash('请先连接音视频');return false}
  const target=room.value,generation=mediaGeneration
  const stale=()=>generation!==mediaGeneration || leaving || room.value!==target
  deviceBusy.value=true
  try{
    if(kind==='mic'){
      const enabled=!microphone.value,muteRevision=hostMuteRevision
      await target.localParticipant.setMicrophoneEnabled(enabled)
      if(enabled && (stale() || muteRevision!==hostMuteRevision))await target.localParticipant.setMicrophoneEnabled(false)
      if(!stale())microphone.value=target.localParticipant.isMicrophoneEnabled
    }
    if(kind==='camera'){
      const enabled=!camera.value;await target.localParticipant.setCameraEnabled(enabled)
      if(enabled && stale())await target.localParticipant.setCameraEnabled(false)
      if(!stale())camera.value=target.localParticipant.isCameraEnabled
    }
    if(kind==='screen'){
      const enabled=screenEnabled ?? !sharing.value
      await target.localParticipant.setScreenShareEnabled(enabled,{audio:false})
      if(enabled && stale())await target.localParticipant.setScreenShareEnabled(false)
      if(!stale())sharing.value=target.localParticipant.isScreenShareEnabled
      return !stale() && sharing.value===enabled
    }
  }catch(e){if(!stale()){const message=explainMediaError(e,{operation:kind});if(message)flash(message)}}
  finally{deviceBusy.value=false}
}
function sendPresentation(action) {
  if(socket?.send({type:'PRESENTATION',...action}))return true
  flash('连接已断开，请稍后重试')
  return false
}
function clearHandoff() {
  clearTimeout(handoffTimer)
  handoff.value=null
}
async function cancelHandoff(message='') {
  const attempt=handoff.value
  clearHandoff()
  if(!attempt || leaving)return
  if(ownInvitation.value?.id===attempt.segmentId)handoffNote.value=message
  if(attempt.trackSid && attempt.room===room.value &&
    attempt.room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.trackSid===attempt.trackSid){
    try{
      await attempt.room.localParticipant.setScreenShareEnabled(false)
      if(room.value===attempt.room)sharing.value=attempt.room.localParticipant.isScreenShareEnabled
    }catch{flash('共享仍在进行，请手动停止共享。')}
  }
}
async function acceptPresentation(segmentId,withScreen) {
  const offer=ownInvitation.value
  if(offer?.id!==segmentId || connection.value!=='connected' || handoff.value || deviceBusy.value)return
  handoffNote.value=''
  const attempt={segmentId,room:room.value,phase:'selecting'}
  handoff.value=attempt
  if(withScreen && !sharing.value) {
    if(!await device('screen',true)){
      cancelHandoff('共享未开启。可以重试，或直接开始汇报。')
      return
    }
    attempt.trackSid=attempt.room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.trackSid
  }
  if(leaving || ownInvitation.value?.id!==segmentId || connection.value!=='connected'){
    cancelHandoff('邀请已变更，请查看议程。')
    return
  }
  handoff.value={...attempt,phase:'confirming'}
  if(!socket?.send({type:'PRESENTATION',action:'ACCEPT',segmentId})){
    cancelHandoff('连接中断，恢复后可重新接手。')
    return
  }
  handoffTimer=setTimeout(()=>cancelHandoff('接手确认超时，请重试。'),8000)
}
function sendPoint(point) {
  if(socket?.send({type:'SCREEN_POINT',...point}))addPoint(point,true)
  else flash('连接已断开，请稍后重试')
}
function sendChat(){
  const content=draft.value.trim();if(!content || connection.value!=='connected')return
  const clientId=globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  pending.value.push({client_id:clientId,user_id:user.current.id,content,nickname:localMember.value?.nickname||meeting.value.nickname,created_at:Date.now(),isPending:true})
  sendPending(pending.value[pending.value.length-1]);draft.value=''
  nextTick(scrollChatBottom)
}
function sendHostAction(action) {
  if (!isHost.value) return
  if (!socket?.send(action)) flash('连接已断开，请稍后重试')
}
function manage(type, target) {
  closePopovers(true)
  if (type === 'KICK' || type === 'TRANSFER_HOST') {
    confirmTarget.value = target
    confirmKind.value = type === 'KICK' ? 'kick' : 'transferHost'
    return
  }
  sendHostAction({type, userId:target.userId})
}
function openRename(member){closePopovers(true);renameTarget.value=member;renameValue.value=member.nickname}
function rename(){const value=renameValue.value.trim();if(!value)return;if(!socket?.send({type:'RENAME',userId:renameTarget.value.userId,nickname:value}))flash('连接已断开，请稍后重试');renameTarget.value=null}
async function createObs(){obsLoading.value=true;try{obsInfo.value=await api(`/api/meetings/${number}/obs`,{method:'POST'});showKey.value=false}catch(e){flash(requestError(e))}finally{obsLoading.value=false}}
async function stopObs(){obsLoading.value=true;try{await api(`/api/meetings/${number}/obs`,{method:'DELETE'});obsInfo.value=null;flash('OBS 推流已停止')}catch(e){flash(requestError(e))}finally{obsLoading.value=false}}
async function leave(){
  leaving=true;mediaGeneration++;socket?.close()
  try{await api(`/api/meetings/${number}/obs`,{method:'DELETE'})}catch{flash('OBS 推流未能确认关闭，请在 OBS 中停止推流。')}
  await room.value?.disconnect();room.value=null;showEnded()
}
async function endMeeting(){try{await api(`/api/meetings/${number}/end`,{method:'POST'});if(leaving)return;leaving=true;socket?.close();await room.value?.disconnect();showEnded(true)}catch(e){flash(requestError(e))}}
const confirmation=computed(()=>({
  leave:{title:'离开会议',description:'确定离开当前会议？你可以使用会议号重新加入。',action:'离开会议'},
  end:{title:'结束会议',description:'确定结束本次会议？所有成员将离开会议。',action:'结束会议'},
  kick:{title:'移出成员',description:`确定将“${confirmTarget.value?.nickname || ''}”移出会议？`,action:'移出成员'},
  muteAll:{title:'全员静音',description:'静音其他在会成员。成员可随时自行开麦。',action:'全员静音',destructive:false},
  lock:{title:'锁定会议',description:'锁定后，新成员无法加入。已获准加入的成员可用当前登录会话重连。',action:'锁定会议',destructive:false},
  transferHost:{title:'转让主持人',description:`将主持人交给“${confirmTarget.value?.nickname || ''}”？对方将负责管理本次会议。`,action:'转让主持人',destructive:false},
})[confirmKind.value] || {})
async function confirmAction(){
  if(confirmBusy.value)return
  confirmBusy.value=true
  try{
    if(confirmKind.value==='leave')await leave()
    else if(confirmKind.value==='end' && isHost.value)await endMeeting()
    else if (confirmKind.value === 'muteAll') sendHostAction({type:'MUTE_ALL'})
    else if (confirmKind.value === 'lock') sendHostAction({type:'SET_MEETING_LOCK',locked:true})
    else if (confirmTarget.value && ['kick','transferHost'].includes(confirmKind.value)) {
      sendHostAction({type:confirmKind.value === 'kick' ? 'KICK' : 'TRANSFER_HOST',userId:confirmTarget.value.userId})
      menu.value=''
    }
  }finally{confirmKind.value='';confirmTarget.value=null;confirmBusy.value=false}
}
function time(value){return new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit'}).format(value)}
function onShortcut(event){
  const target=event.target
  const typing=!!target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
  if(event.key==='Escape'){
    if(shortcutsDialog.value || renameTarget.value || obsDialog.value || inviteDialog.value || confirmKind.value)return
    if(closePopovers(true)){event.preventDefault();return}
    if(drawerOpen.value){event.preventDefault();closePanel();return}
    if(typing)return
    if(panel.value==='chat')panel.value='members'
    return
  }
  if(!meeting.value || fatal.value || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.repeat || shortcutsDialog.value || renameTarget.value || obsDialog.value || inviteDialog.value || confirmKind.value || typing)return
  const key=event.key.toLowerCase()
  if(key==='?'){event.preventDefault();shortcutsDialog.value=true;return}
  if(key==='c'){event.preventDefault();openPanel('chat');return}
  if(deviceBusy.value || mediaDevices.switching.value)return
  const kind=({m:'mic',v:'camera',s:'screen'})[key]
  if(kind==='screen' && handoff.value && !sharing.value)return
  if(kind && (kind!=='screen' || screenShareSupported)){event.preventDefault();device(kind)}
}
function updateWidth(){narrowScreen.value=!!widthQuery?.matches;if(!narrowScreen.value)sideOpen.value=false}
onMounted(() => {
  widthQuery = window.matchMedia?.('(max-width: 900px)')
  updateWidth()
  widthQuery?.addEventListener?.('change', updateWidth)
  document.addEventListener('keydown', onShortcut)
  document.addEventListener('pointerdown', onOutsidePointer)
  load()
})
onBeforeUnmount(() => {
  leaving = true
  mediaGeneration++
  clearTimeout(noticeTimer)
  clearInterval(presentationTimer)
  clearHandoff()
  clearTimeout(pointTimer)
  widthQuery?.removeEventListener?.('change', updateWidth)
  document.removeEventListener('keydown', onShortcut)
  document.removeEventListener('pointerdown', onOutsidePointer)
  for (const id of pendingTimers.keys()) clearPendingTimer(id)
  socket?.close()
  room.value?.disconnect()
})
</script>
<template>
  <main class="conference-page">
    <div class="sr-only room-announcements" aria-live="polite" aria-atomic="true">{{ announcement }}</div>
    <div v-if="loading" class="conference-full-state"><span class="loader"></span> 正在进入会议…</div>
    <div v-else-if="fatal" class="conference-full-state"><strong>{{ fatal }}</strong><button class="meeting-button outline" @click="router.push('/')">返回首页</button></div>
    <template v-else-if="meeting">
      <header class="conference-header" :inert="drawerOpen">
        <div class="conference-title">
          <button class="conference-back" aria-label="离开会议并返回首页" @click="confirmKind='leave'"><ArrowLeft :size="19"/></button>
          <LogoMark />
          <div><strong>{{ meeting.title }}</strong><small>{{ groupNumber(number) }}</small></div>
        </div>
        <div class="conference-header-right">
          <span v-if="locked" class="conference-lock" role="img" aria-label="会议已锁定" title="会议已锁定"><LockKeyhole :size="14"/><span>已锁定</span></span>
          <span class="connection-status" :class="connection"><i></i><span class="connection-text">{{ connectionText }}</span></span>
          <button class="meeting-button conference-share" aria-label="邀请参会者" @click="inviteDialog=true"><Copy :size="15"/> <span>邀请</span></button>
          <button class="meeting-button conference-share shortcut-trigger" aria-label="查看快捷键" @click="shortcutsDialog=true"><Keyboard :size="16"/></button>
          <button v-if="isHost" class="end-meeting" @click="confirmKind='end'">结束会议</button>
          <button class="user-initial" :style="avatarStyle(user.current.id)" :title="localMember?.nickname || meeting.nickname" aria-label="修改我的昵称" @click="openRename(localMember || {userId:user.current.id,nickname:meeting.nickname})">{{ (localMember?.nickname || meeting.nickname)?.slice(0,1) }}</button>
        </div>
      </header>
      <div class="meeting-feedback">
        <Transition name="feedback-motion">
          <div v-if="connection==='reconnecting'" class="connection-banner" role="status">正在重新连接，连接恢复后可继续发送消息。</div>
        </Transition>
        <Transition name="feedback-motion">
          <div v-if="mediaStatusMessage" class="conference-alert">
            <span role="status">{{ mediaStatusMessage }}</span><button v-if="mediaError" @click="connectMedia">重新连接</button>
          </div>
        </Transition>
        <Transition name="feedback-motion">
          <div v-if="notice" class="toast meeting-toast" aria-hidden="true">{{ notice }}</div>
        </Transition>
      </div>
      <div class="conference-layout" :class="{ entering }" @animationend.self="entering=false">
        <section class="conference-main" :inert="drawerOpen">
          <MeetingMedia :room="room" :members="members" :user-id="user.current.id" :media-state="mediaState" :meeting-number="number"
            :presenter-id="currentSegment?.presenterId" :can-point="presentationTools && connection==='connected' && mediaState==='connected' && !drawerOpen"
            :points="points"
            @invite="copy(inviteText,'邀请信息已复制')" @point="sendPoint">
            <template #stage-action>
              <button v-if="ownInvitation || currentSegment || (narrowScreen && presentationTools)" ref="presentationBrief" class="presentation-brief"
                :class="{ invited: ownInvitation, overtime }" aria-controls="meeting-side"
                :aria-expanded="narrowScreen ? drawerOpen && panel==='presentation' : undefined" @click="openPanel('presentation',$event)">
                <ListOrdered :size="16" aria-hidden="true" />
                <strong :key="ownInvitation?.id || currentSegment?.id">{{ ownInvitation?.title || currentSegment?.title || '汇报' }}</strong>
                <span v-if="ownInvitation" class="presentation-brief-action">接手汇报 <ArrowRight :size="14" aria-hidden="true" /></span>
                <span v-else-if="currentSegment"><Clock3 :size="14" aria-hidden="true" /> {{ remaining }}</span>
              </button>
            </template>
          </MeetingMedia>
          <div class="conference-toolbar" @pointerdown="startToolbarSwipe" @pointerup="finishToolbarSwipe"
            @pointercancel="toolbarTouch=null" @click.capture="preventSwipeClick">
            <div class="toolbar-controls">
              <div class="device-control-wrap" data-room-popover><button class="meeting-control" :class="{ enabled:microphone, 'mute-feedback':muteFeedback }" :disabled="deviceBusy || mediaDevices.switching.value" @click="device('mic')" @animationend="muteFeedback=false" :aria-label="microphone ? '关闭麦克风' : '开启麦克风'"><span class="control-symbol"><Transition name="control-icon"><Mic v-if="microphone" key="on" :size="20"/><MicOff v-else key="off" :size="20"/></Transition></span><span>{{ microphone ? '麦克风' : '麦克风关闭' }}</span></button><button class="device-arrow" aria-label="选择麦克风和扬声器" :aria-expanded="deviceMenu==='audioinput'" @click="openDeviceMenu('audioinput',$event)"><ChevronUp :size="14"/></button>
                <div v-if="deviceMenu==='audioinput'" class="device-popover"><strong>麦克风</strong><button :class="{chosen:!mediaDevices.selected.microphoneId}" @click="selectDevice('audioinput','')">系统默认</button><button v-for="(item,index) in mediaDevices.devices.value.filter(d=>d.kind==='audioinput' && d.deviceId)" :key="item.deviceId" :class="{chosen:mediaDevices.selected.microphoneId===item.deviceId}" @click="selectDevice('audioinput',item.deviceId)">{{ item.label || `麦克风 ${index+1}` }}</button><template v-if="mediaDevices.speakerSupported"><strong>扬声器</strong><button :class="{chosen:!mediaDevices.selected.speakerId}" @click="selectDevice('audiooutput','')">系统默认</button><button v-for="(item,index) in mediaDevices.devices.value.filter(d=>d.kind==='audiooutput' && d.deviceId)" :key="item.deviceId" :class="{chosen:mediaDevices.selected.speakerId===item.deviceId}" @click="selectDevice('audiooutput',item.deviceId)">{{ item.label || `扬声器 ${index+1}` }}</button></template></div>
              </div>
              <div class="device-control-wrap" data-room-popover><button class="meeting-control" :class="{ enabled:camera }" :disabled="deviceBusy || mediaDevices.switching.value" @click="device('camera')" :aria-label="camera ? '关闭摄像头' : '开启摄像头'"><span class="control-symbol"><Transition name="control-icon"><Video v-if="camera" key="on" :size="20"/><VideoOff v-else key="off" :size="20"/></Transition></span><span>{{ camera ? '摄像头' : '摄像头关闭' }}</span></button><button class="device-arrow" aria-label="选择摄像头" :aria-expanded="deviceMenu==='videoinput'" @click="openDeviceMenu('videoinput',$event)"><ChevronUp :size="14"/></button>
                <div v-if="deviceMenu==='videoinput'" class="device-popover"><strong>摄像头</strong><button :class="{chosen:!mediaDevices.selected.cameraId}" @click="selectDevice('videoinput','')">系统默认</button><button v-for="(item,index) in mediaDevices.devices.value.filter(d=>d.kind==='videoinput' && d.deviceId)" :key="item.deviceId" :class="{chosen:mediaDevices.selected.cameraId===item.deviceId}" @click="selectDevice('videoinput',item.deviceId)">{{ item.label || `摄像头 ${index+1}` }}</button></div>
              </div>
              <button v-if="screenShareSupported" class="meeting-control" :class="{ enabled:sharing }" :disabled="deviceBusy || (!!handoff && !sharing)" @click="device('screen')" :aria-label="sharing ? '停止共享' : '共享屏幕'"><span class="control-symbol"><MonitorUp :size="20"/><i v-if="sharing" class="sharing-dot" aria-hidden="true"></i></span><span>{{ sharing ? '停止共享' : '共享屏幕' }}</span></button>
              <span v-else class="screen-unavailable">当前浏览器不支持屏幕共享</span>
              <button class="meeting-control desktop-obs-control" @click="obsDialog=true" aria-label="OBS 推流"><Settings2 :size="20"/><span>OBS</span></button>
              <div class="mobile-more-wrap" data-room-popover>
                <button ref="moreButton" class="meeting-control" :aria-label="unread ? `更多会议功能，${unread} 条未读消息` : '更多会议功能'" :aria-expanded="moreOpen" @click="toggleMore"><MoreHorizontal :size="20"/><span>更多<span v-if="unread" class="mobile-unread"> · {{ unread>99 ? '99+' : unread }}</span></span></button>
                <div v-if="moreOpen" class="mobile-more-menu">
                  <button @click="openPanel('members')"><Users :size="16"/> 成员（{{ members.length }}）</button>
                  <button @click="openPanel('chat')"><MessageSquare :size="16"/> 聊天 <span v-if="unread">（{{ unread }}）</span></button>
                  <button v-if="presentationTools" @click="openPanel('presentation')"><ListOrdered :size="16"/> 汇报<i v-if="ownInvitation" class="presentation-invite-dot"></i></button>
                  <button @click="closePopovers(true);obsDialog=true"><Settings2 :size="16"/> OBS 推流</button>
                  <button @click="closePopovers(true);shortcutsDialog=true"><Keyboard :size="16"/> 快捷键</button>
                  <p v-if="!screenShareSupported">当前浏览器不支持屏幕共享</p>
                </div>
              </div>
              <button class="meeting-control leave-control" @click="confirmKind='leave'"><LogOut :size="20"/><span>离开</span></button>
            </div>
          </div>
        </section>
        <MeetingSidePanel v-model:tab="panel" :compact="narrowScreen" :drawer-open="drawerOpen"
          :member-count="members.length" :unread="unread" :presentation-tools="presentationTools" :invited="!!ownInvitation" @close="closePanel">
          <template #members>
            <div class="side-caption">{{ connection==='connected' ? `${members.length} 人在会` : connectionText }}</div>
            <div v-if="isHost && supportsHostControls" class="host-controls" aria-label="主持人操作" role="group">
              <button :disabled="connection !== 'connected' || members.length < 2" @click="confirmKind='muteAll'">
                <MicOff :size="16"/> 全员静音
              </button>
              <button v-if="locked" :disabled="connection !== 'connected'" @click="sendHostAction({type:'SET_MEETING_LOCK',locked:false})">
                <LockKeyholeOpen :size="16"/> 解锁会议
              </button>
              <button v-else :disabled="connection !== 'connected'" @click="confirmKind='lock'">
                <LockKeyhole :size="16"/> 锁定会议
              </button>
            </div>
            <div v-for="member in members" :key="member.userId" class="member-row" data-room-popover>
              <span class="member-avatar" :style="avatarStyle(member.userId)">{{ member.nickname?.slice(0,1) }}</span>
              <div class="member-name"><strong>{{ member.nickname }}{{ member.userId===user.current.id ? '（我）' : '' }}</strong><small>{{ member.host ? '主持人' : '参会者' }} · {{ mediaState==='connected' ? (memberMedia[member.userId]?.publishing ? '推流中' : '未推流') : '音视频未连接' }}</small></div>
              <span class="member-mic" :class="{ on: mediaState==='connected' && memberMedia[member.userId]?.microphone }" :title="mediaState==='connected' ? (memberMedia[member.userId]?.microphone ? '麦克风开' : '麦克风关') : '麦克风状态未知'"><Mic v-if="mediaState==='connected' && memberMedia[member.userId]?.microphone" :size="16"/><MicOff v-else :size="16"/></span>
              <button v-if="isHost && member.userId!==user.current.id" class="member-menu-button" :aria-label="`管理 ${member.nickname}`" :aria-expanded="menu===member.userId" @click="toggleMember(member.userId,$event)"><MoreHorizontal :size="19"/></button>
              <button v-else-if="member.userId===user.current.id" class="member-menu-button" aria-label="修改我的昵称" @click="openRename(member)"><Settings2 :size="16"/></button>
              <div v-if="isHost && menu===member.userId" class="member-popover">
                <button @click="manage('MUTE',member)">静音</button>
                <button @click="openRename(member)">修改昵称</button>
                <button v-if="supportsHostControls" @click="manage('TRANSFER_HOST',member)">转让主持人</button>
                <button class="danger-text" @click="manage('KICK',member)">移出会议</button>
              </div>
            </div>
            <div v-if="!members.length" class="panel-empty">正在同步成员…</div>
          </template>
          <template #chat>
            <div class="chat-scroll-wrap"><div ref="chatList" class="conference-chat" tabindex="0" role="region" aria-label="消息记录" @scroll="onChatScroll">
              <div v-if="!messages.length && !pending.length" class="chat-empty"><MessageSquare :size="22"/><strong>还没有消息</strong><span>会议消息只对当前成员可见。</span></div>
              <TransitionGroup name="chat-motion" tag="div"><div v-for="message in chatMessages" :key="messageKey(message)" class="conference-message" :class="{pending:message.isPending,grouped:message.grouped}"><span v-if="!message.grouped" class="message-avatar" :style="avatarStyle(message.user_id)" aria-hidden="true">{{ message.nickname?.slice(0,1) }}</span><div><strong v-if="!message.grouped">{{ message.nickname }}</strong><time>{{ message.isPending ? (message.failed ? '未发送' : '发送中') : time(message.created_at) }}</time><button v-if="message.failed" class="retry-message" @click="retryMessage(pending.find(item=>item.client_id===message.client_id))">重发</button></div><p><template v-for="(part,index) in message.parts" :key="index"><a v-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer">{{ part.text }}</a><template v-else>{{ part.text }}</template></template></p></div></TransitionGroup>
            </div><Transition name="chat-jump"><button v-if="waitingMessages" class="chat-new-messages" @click="jumpToLatest">
              <ArrowDown :size="14" /> {{ waitingMessages > 99 ? '99+' : waitingMessages }} 条新消息
            </button></Transition></div>
            <div v-if="draft.length>=900" class="chat-counter" aria-live="polite">还可输入 {{ 1000-draft.length }} 字</div>
            <form class="conference-chat-form" @submit.prevent="sendChat"><input v-model="draft" maxlength="1000" :disabled="connection!=='connected'" aria-label="会议消息" placeholder="输入消息…"/><button :disabled="!draft.trim() || connection!=='connected'" aria-label="发送消息"><Send :size="18"/></button></form>
          </template>
          <template #presentation>
            <MeetingPresentationPanel :state="presentation" :members="members" :user-id="user.current.id" :host="isHost"
              :connected="connection==='connected'" :compact="narrowScreen" :can-share="screenShareSupported" :media-ready="mediaState==='connected'"
              :busy="deviceBusy || !!handoff" :handoff-phase="handoff?.phase" :handoff-note="handoffNote"
              :remaining="remaining" :overtime="overtime"
              @action="sendPresentation" @takeover="acceptPresentation" @copy="value=>copy(value,'未回答问题已复制')" />
          </template>
        </MeetingSidePanel>
      </div>
      <ModalDialog :open="!!renameTarget" labelledby="rename-title" dialog-class="meeting-dialog" @close="renameTarget=null">
        <h2 id="rename-title">修改会议昵称</h2><p class="muted">此昵称只在当前会议中显示。</p><form class="form-stack" @submit.prevent="rename"><label>会议昵称<input v-model.trim="renameValue" maxlength="40" required/></label><button class="meeting-button primary full">保存昵称 <Check :size="17"/></button></form>
      </ModalDialog>
      <ModalDialog :open="obsDialog" labelledby="obs-title" dialog-class="meeting-dialog obs-dialog" @close="obsDialog=false">
        <h2 id="obs-title">通过 OBS 推流</h2><p class="muted">在 OBS 的“设置 → 推流”中选择 WHIP，填入下面的信息。OBS 与浏览器请勿同时采集同一个麦克风，以免产生回声。</p><template v-if="obsInfo"><div class="obs-fields"><label>服务器地址<div><input readonly :value="obsInfo.url"/><button @click="copy(obsInfo.url)" aria-label="复制服务器地址"><Copy :size="16"/></button></div></label><label>Bearer Token<div><input readonly :type="showKey?'text':'password'" :value="obsInfo.streamKey"/><button @click="showKey=!showKey">{{ showKey ? '隐藏' : '显示' }}</button><button @click="copy(obsInfo.streamKey)" aria-label="复制 Token"><Copy :size="16"/></button></div></label></div><p class="obs-note">请勿向他人泄露 Token。重新生成会使原推流地址失效。</p><div class="obs-actions"><button class="meeting-button outline" :disabled="obsLoading" @click="stopObs">停止推流</button><button class="meeting-button primary" :disabled="obsLoading" @click="createObs">重新生成</button></div></template><button v-else class="meeting-button primary full obs-create" :disabled="obsLoading" @click="createObs">{{ obsLoading ? '正在生成…' : '生成推流信息' }} <ArrowRight :size="17"/></button>
      </ModalDialog>
      <ModalDialog :open="inviteDialog" labelledby="invite-title" dialog-class="meeting-dialog invite-dialog" @close="inviteDialog=false">
        <h2 id="invite-title">邀请参会</h2><p class="muted">分享邀请信息，或让参会者扫描二维码加入。</p>
        <InviteQr v-if="inviteDialog" :value="inviteUrl" />
        <p class="invite-copy">{{ inviteText }}</p>
        <button class="meeting-button primary full" @click="copy(inviteText,'邀请信息已复制')"><Copy :size="16"/> 复制邀请信息</button>
      </ModalDialog>
      <ModalDialog :open="shortcutsDialog" labelledby="shortcuts-title" dialog-class="meeting-dialog shortcuts-dialog" @close="shortcutsDialog=false">
        <h2 id="shortcuts-title">键盘快捷键</h2><p class="muted">输入文字时，快捷键不会触发。</p>
        <dl><div><dt><kbd>M</kbd></dt><dd>开启或关闭麦克风</dd></div><div><dt><kbd>V</kbd></dt><dd>开启或关闭摄像头</dd></div><div><dt><kbd>S</kbd></dt><dd>共享或停止共享屏幕</dd></div><div><dt><kbd>C</kbd></dt><dd>打开聊天</dd></div><div><dt><kbd>Esc</kbd></dt><dd>关闭面板</dd></div><div><dt><kbd>?</kbd></dt><dd>查看快捷键</dd></div></dl>
      </ModalDialog>
      <ConfirmDialog :open="!!confirmKind" :title="confirmation.title" :description="confirmation.description" :confirm-text="confirmation.action" :destructive="confirmation.destructive ?? true" :busy="confirmBusy" @close="confirmKind=''" @confirm="confirmAction" />
    </template>
  </main>
</template>
