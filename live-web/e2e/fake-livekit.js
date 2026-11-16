// Used only by the browser test. It does not access a real device or LiveKit service.
export const RoomEvent=new Proxy({}, {get:(_target,key)=>String(key)})
export const Track={Kind:{Audio:'audio',Video:'video'},Source:{Microphone:'microphone',Camera:'camera',ScreenShare:'screen_share'}}
export const VideoQuality={LOW:'low',HIGH:'high'}
export class Room {
  constructor(){
    this.handlers=new Map();this.remoteParticipants=new Map();this.canPlaybackAudio=true
    this.localParticipant={identity:'user.user-1.session',connectionQuality:'good',isSpeaking:false,trackPublications:new Map(),isCameraEnabled:false,isMicrophoneEnabled:false,isScreenShareEnabled:false}
    this.localParticipant.setMicrophoneEnabled=async value=>{this.localParticipant.isMicrophoneEnabled=value}
    this.localParticipant.setCameraEnabled=async value=>{this.localParticipant.isCameraEnabled=value}
    this.localParticipant.setScreenShareEnabled=async value=>{this.localParticipant.isScreenShareEnabled=value}
  }
  on(event,callback){this.handlers.set(event,callback)}
  off(event){this.handlers.delete(event)}
  async connect(){}
  async disconnect(){}
  async startAudio(){}
}
