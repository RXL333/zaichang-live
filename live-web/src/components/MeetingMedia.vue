<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RoomEvent, Track } from 'livekit-client'
import { ChevronLeft, ChevronRight, Mic, MicOff, MonitorUp, Pin, PinOff, Volume2 } from 'lucide-vue-next'
import MediaTile from './MediaTile.vue'
import LogoMark from './LogoMark.vue'
import { groupNumber } from '../format'

const props=defineProps({room:Object,members:{type:Array,default:()=>[]},userId:String,mediaState:String,meetingNumber:String})
const emit=defineEmits(['invite'])
const audioContainer=ref(null),revision=ref(0),canPlay=ref(true)
const view=ref('gallery'),pinned=ref(''),page=ref(1)
let listeners=[],audioTracks=[],pressTimer
function uid(identity){return (identity||'').split('.')[1]||''}
function update(){revision.value++;attachAudio();canPlay.value=props.room?.canPlaybackAudio!==false}
function updateSpeakers(){revision.value++}
function clearAudio(){for(const {track,element} of audioTracks){track.detach(element);element.remove()}audioTracks=[]}
function attachAudio(){
  clearAudio();if(!props.room || !audioContainer.value)return
  for(const participant of props.room.remoteParticipants.values())for(const publication of participant.trackPublications.values()){
    const track=publication.track
    if(track?.kind===Track.Kind.Audio){const element=track.attach();element.autoplay=true;audioContainer.value.appendChild(element);audioTracks.push({track,element})}
  }
}
function subscribe(room){
  if(!room)return
  const events=[RoomEvent.ParticipantConnected,RoomEvent.ParticipantDisconnected,RoomEvent.TrackPublished,RoomEvent.TrackUnpublished,RoomEvent.TrackSubscribed,RoomEvent.TrackUnsubscribed,RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.LocalTrackPublished,RoomEvent.LocalTrackUnpublished,RoomEvent.AudioPlaybackStatusChanged,RoomEvent.ActiveSpeakersChanged]
  listeners=events.filter(Boolean).map(event=>{const callback=event===RoomEvent.ActiveSpeakersChanged?updateSpeakers:update;room.on(event,callback);return {event,callback}});update()
}
function unsubscribe(room){if(room)listeners.forEach(({event,callback})=>room.off(event,callback));listeners=[];clearAudio()}
watch(()=>props.room,(next,old)=>{unsubscribe(old);subscribe(next)},{immediate:true})
const tiles=computed(()=>{
  revision.value
  const participants=props.room?[props.room.localParticipant,...props.room.remoteParticipants.values()]:[]
  const screens=[],people=[]
  for(const member of props.members){
    const sources=participants.filter(p=>uid(p.identity)===member.userId)
    let camera=null,microphone=false,obs=false,speaking=false
    for(const person of sources){
      const isObs=person.identity?.startsWith('obs.');obs ||= !!isObs
      if(person.isSpeaking)speaking=true
      for(const publication of person.trackPublications.values()){
        if(publication.kind===Track.Kind.Audio && !publication.isMuted && (isObs || publication.source===Track.Source.Microphone))microphone=true
        if(!publication.track || publication.isMuted || publication.kind!==Track.Kind.Video)continue
        if(publication.source===Track.Source.ScreenShare)screens.push({key:`screen-${person.identity}`,track:publication.track,name:member.nickname,screen:true,local:member.userId===props.userId})
        else if(!camera || isObs)camera=publication.track
      }
    }
    people.push({key:`person-${member.userId}`,track:camera,name:member.nickname,microphone,obs,speaking,host:member.host,local:member.userId===props.userId})
  }
  return [...screens,...people]
})
const primary=computed(()=>tiles.value.find(tile=>tile.key===pinned.value) || tiles.value.find(tile=>tile.screen) || tiles.value.find(tile=>tile.speaking) || tiles.value[0])
const pageCount=computed(()=>view.value==='gallery' ? Math.max(1,Math.ceil(tiles.value.length/9)) : Math.max(1,Math.ceil((tiles.value.length-1)/8)))
const visible=computed(()=>{
  if(view.value==='gallery')return tiles.value.slice((page.value-1)*9,page.value*9)
  const others=tiles.value.filter(tile=>tile.key!==primary.value?.key)
  return [primary.value,...others.slice((page.value-1)*8,page.value*8)].filter(Boolean)
})
const visibleKeys=computed(()=>new Set(visible.value.map(tile=>tile.key)))
const alone=computed(()=>props.members.length===1 && props.members[0].userId===props.userId)
const layout=computed(()=>{const n=visible.value.length;return n<=1?'layout-1':n===2?'layout-2':n<=4?'layout-4':n<=6?'layout-6':'layout-9'})
function setView(value){view.value=value;page.value=1}
function togglePin(tile){pinned.value=pinned.value===tile.key?'':tile.key;if(pinned.value){view.value='speaker';page.value=1}}
function startPress(event,tile){if(event.pointerType!=='touch')return;clearTimeout(pressTimer);pressTimer=setTimeout(()=>togglePin(tile),550)}
function endPress(){clearTimeout(pressTimer);pressTimer=null}
watch(()=>tiles.value.map(tile=>tile.key),keys=>{if(pinned.value && !keys.includes(pinned.value))pinned.value='';if(page.value>pageCount.value)page.value=pageCount.value})
watch(()=>tiles.value.filter(tile=>tile.screen).map(tile=>tile.key),(current,previous=[])=>{if(current.some(key=>!previous.includes(key))){view.value='speaker';page.value=1}},{immediate:true})
async function startAudio(){try{await props.room?.startAudio();canPlay.value=props.room?.canPlaybackAudio!==false}catch{canPlay.value=false}}
watch(audioContainer,()=>attachAudio())
onBeforeUnmount(()=>{endPress();unsubscribe(props.room)})
</script>
<template>
  <div class="meeting-stage" :class="{ 'stage-screen': tiles.some(tile=>tile.screen), 'stage-single': tiles.length===1 }">
    <div ref="audioContainer" class="audio-renderers" aria-hidden="true"></div>
    <div v-if="!tiles.length" class="meeting-stage-empty"><LogoMark /><strong>{{ mediaState==='connecting' ? '正在连接会议' : '等待成员加入' }}</strong><p>{{ mediaState==='connecting' ? '音视频连接中，请稍候。' : '成员加入后，画面会显示在这里。' }}</p></div>
    <template v-else>
      <div class="stage-views" aria-label="画面布局"><button :class="{active:view==='gallery'}" :aria-pressed="view==='gallery'" @click="setView('gallery')">画廊</button><button :class="{active:view==='speaker'}" :aria-pressed="view==='speaker'" @click="setView('speaker')">演讲者</button></div>
      <div class="conference-tiles" :class="[layout,view==='speaker'?'speaker-layout':'gallery-layout',{'single-speaker':visible.length===1}]" :style="{'--thumbnail-count':Math.max(1,visible.length-1)}">
        <div v-for="tile in tiles" v-show="visibleKeys.has(tile.key)" :key="tile.key" class="conference-tile" :class="{ 'screen-share-tile':tile.screen, 'camera-on':!!tile.track, speaking:tile.speaking, 'tile-primary':view==='speaker' && tile.key===primary?.key }" @pointerdown="startPress($event,tile)" @pointerup="endPress" @pointercancel="endPress" @pointerleave="endPress" @contextmenu.prevent>
          <MediaTile v-if="tile.track" :track="tile.track" :muted="true"/><div v-else class="tile-avatar">{{ tile.name?.slice(0,1) || '会' }}</div>
          <button class="tile-pin" :aria-label="`${pinned===tile.key?'取消固定':'固定'}${tile.screen ? tile.name+'的屏幕' : tile.name}`" :aria-pressed="pinned===tile.key" @pointerdown.stop @click.stop="togglePin(tile)"><PinOff v-if="pinned===tile.key" :size="15"/><Pin v-else :size="15"/></button>
          <div v-if="tile.screen" class="tile-screen-label"><MonitorUp :size="14"/> {{ tile.name }}的屏幕</div><div v-else class="tile-name"><span>{{ tile.name }}{{ tile.local ? '（我）' : '' }}</span><span v-if="tile.host" class="tile-host">主持人</span><span v-if="tile.obs" class="tile-obs">OBS</span><Mic v-if="tile.microphone" :size="14"/><MicOff v-else class="mic-off" :size="14"/></div>
        </div>
      </div>
      <nav v-if="pageCount>1" class="stage-pagination" aria-label="画面分页"><button :disabled="page===1" aria-label="上一页画面" @click="page--"><ChevronLeft :size="15"/></button><span>{{ page }} / {{ pageCount }}</span><button :disabled="page===pageCount" aria-label="下一页画面" @click="page++"><ChevronRight :size="15"/></button></nav>
    </template>
    <Transition name="alone-card"><div v-if="alone" class="alone-card"><strong>你是第一个到场的人</strong><span>会议号 {{ groupNumber(meetingNumber) }}</span><button @click="emit('invite')">复制邀请</button></div></Transition>
    <button v-if="!canPlay" class="unlock-audio" @click="startAudio"><Volume2 :size="16"/> 点击开启声音</button>
  </div>
</template>
