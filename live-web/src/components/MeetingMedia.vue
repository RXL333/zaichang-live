<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RoomEvent, Track } from 'livekit-client'
import { Mic, MicOff, MonitorUp, Volume2 } from 'lucide-vue-next'
import MediaTile from './MediaTile.vue'

const props=defineProps({room:Object,members:{type:Array,default:()=>[]},userId:String,mediaState:String})
const audioContainer=ref(null),revision=ref(0),canPlay=ref(true)
let listeners=[],audioTracks=[]
function uid(identity){return (identity||'').split('.')[1]||''}
function update(){revision.value++;attachAudio();canPlay.value=props.room?.canPlaybackAudio!==false}
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
  const events=[RoomEvent.ParticipantConnected,RoomEvent.ParticipantDisconnected,RoomEvent.TrackPublished,RoomEvent.TrackUnpublished,RoomEvent.TrackSubscribed,RoomEvent.TrackUnsubscribed,RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.LocalTrackPublished,RoomEvent.LocalTrackUnpublished,RoomEvent.AudioPlaybackStatusChanged]
  listeners=events.filter(Boolean).map(event=>{room.on(event,update);return event});update()
}
function unsubscribe(room){if(room)listeners.forEach(event=>room.off(event,update));listeners=[];clearAudio()}
watch(()=>props.room,(next,old)=>{unsubscribe(old);subscribe(next)},{immediate:true})
const tiles=computed(()=>{
  revision.value
  const participants=props.room?[props.room.localParticipant,...props.room.remoteParticipants.values()]:[]
  const screens=[],people=[]
  for(const member of props.members){
    const sources=participants.filter(p=>uid(p.identity)===member.userId)
    let camera=null,microphone=false,obs=false
    for(const person of sources){
      const isObs=person.identity?.startsWith('obs.');obs ||= !!isObs
      for(const publication of person.trackPublications.values()){
        if(publication.kind===Track.Kind.Audio && !publication.isMuted && (isObs || publication.source===Track.Source.Microphone))microphone=true
        if(!publication.track || publication.isMuted || publication.kind!==Track.Kind.Video)continue
        if(publication.source===Track.Source.ScreenShare)screens.push({key:`screen-${person.identity}`,track:publication.track,name:member.nickname,screen:true,local:member.userId===props.userId})
        else if(!camera || isObs)camera=publication.track
      }
    }
    people.push({key:`person-${member.userId}`,track:camera,name:member.nickname,microphone,obs,host:member.host,local:member.userId===props.userId})
  }
  return [...screens,...people]
})
async function startAudio(){try{await props.room?.startAudio();canPlay.value=props.room?.canPlaybackAudio!==false}catch{canPlay.value=false}}
watch(audioContainer,()=>attachAudio())
onBeforeUnmount(()=>unsubscribe(props.room))
</script>
<template>
  <div class="meeting-stage" :class="{ 'stage-screen': tiles.some(tile=>tile.screen), 'stage-single': tiles.length===1 }">
    <div ref="audioContainer" class="audio-renderers" aria-hidden="true"></div>
    <div v-if="!tiles.length" class="meeting-stage-empty"><span class="meeting-stage-logo">✳</span><strong>{{ mediaState==='connecting' ? '正在连接会议' : '等待成员加入' }}</strong><p>每一次交流，都从这里开始。</p></div>
    <div v-else class="conference-tiles"><div v-for="tile in tiles" :key="tile.key" class="conference-tile" :class="{ 'screen-share-tile':tile.screen, 'camera-on':!!tile.track }"><MediaTile v-if="tile.track" :track="tile.track" :muted="true"/><div v-else class="tile-avatar">{{ tile.name?.slice(0,1) || '会' }}</div><div v-if="tile.screen" class="tile-screen-label"><MonitorUp :size="14"/> {{ tile.name }}的屏幕</div><div v-else class="tile-name"><span>{{ tile.name }}{{ tile.local ? '（我）' : '' }}</span><span v-if="tile.host" class="tile-host">主持人</span><span v-if="tile.obs" class="tile-obs">OBS</span><Mic v-if="tile.microphone" :size="14"/><MicOff v-else :size="14"/></div></div></div>
    <button v-if="!canPlay" class="unlock-audio" @click="startAudio"><Volume2 :size="16"/> 点击开启声音</button>
  </div>
</template>
