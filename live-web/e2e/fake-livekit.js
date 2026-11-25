// Used only by the browser test. It does not access a real device or LiveKit service.
export const RoomEvent=new Proxy({}, {get:(_target,key)=>String(key)})
export const Track={Kind:{Audio:'audio',Video:'video'},Source:{Microphone:'microphone',Camera:'camera',ScreenShare:'screen_share'}}
export const VideoQuality={LOW:'low',HIGH:'high'}
export class Room {
  constructor(){
    this.handlers=new Map();this.remoteParticipants=new Map();this.canPlaybackAudio=true
    this.localParticipant={identity:'user.user-1.session',connectionQuality:'good',isSpeaking:false,trackPublications:new Map(),isCameraEnabled:false,isMicrophoneEnabled:false,isScreenShareEnabled:false}
    this.localParticipant.getTrackPublication=source=>[...this.localParticipant.trackPublications.values()].find(track=>track.source===source)
    this.localParticipant.setMicrophoneEnabled=async value=>{this.localParticipant.isMicrophoneEnabled=value}
    this.localParticipant.setCameraEnabled=async value=>{this.localParticipant.isCameraEnabled=value}
    this.localParticipant.setScreenShareEnabled=async value=>{
      if(value)await globalThis.meetingTestScreenPicker?.()
      this.localParticipant.isScreenShareEnabled=value
      const sid='TR_test_screen'
      if(value){
        const canvas=document.createElement('canvas')
        canvas.width=640
        canvas.height=360
        const context=canvas.getContext('2d')
        const stream=canvas.captureStream(5)
        this.screenStream=stream
        this.localParticipant.trackPublications.set(sid,{
          trackSid:sid,kind:Track.Kind.Video,source:Track.Source.ScreenShare,isMuted:false,
          track:{
            attach(element){element.srcObject=stream;context.fillStyle='#d9daca';context.fillRect(0,0,640,360)},
            detach(element){element.srcObject=null},
          },
        })
      }else{
        this.screenStream?.getTracks().forEach(track=>track.stop())
        this.localParticipant.trackPublications.delete(sid)
      }
      this.handlers.get(value ? RoomEvent.LocalTrackPublished : RoomEvent.LocalTrackUnpublished)?.()
    }
  }
  on(event,callback){this.handlers.set(event,callback)}
  off(event){this.handlers.delete(event)}
  async connect(){}
  async disconnect(){this.screenStream?.getTracks().forEach(track=>track.stop())}
  async startAudio(){}
}
