<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Camera, CheckCircle2, Headphones, Mic, Volume2 } from 'lucide-vue-next'
import { loadDevicePreferences, saveDevicePreferences, supportsSpeakerSelection } from '../devicePreferences'
import { mediaError } from '../mediaErrors'

const emit = defineEmits(['change'])
const selection = reactive({ ...loadDevicePreferences(), microphoneOn:false, cameraOn:false })
const devices = ref([]), checked = ref(false), checking = ref(false), messages = ref([])
const video = ref(null), videoReady = ref(false), audioReady = ref(false), volume = ref(0), speakerSupported = supportsSpeakerSelection()
let videoStream, audioStream, meterContext, meterFrame, testAudio, alive = true
const revisions = { video:0, audio:0 }
const byKind = kind => computed(() => devices.value.filter(device => device.kind === kind))
const microphones = byKind('audioinput'), cameras = byKind('videoinput'), speakers = byKind('audiooutput')

watch(selection, value => { saveDevicePreferences(value); emit('change', { ...value }) }, { deep:true, immediate:true })
function stopTracks(stream) { stream?.getTracks().forEach(track => track.stop()) }
function stopMeter() {
  if (meterFrame) cancelAnimationFrame(meterFrame)
  meterFrame = null; volume.value = 0
  const context = meterContext; meterContext = null
  if (context && context.state !== 'closed') context.close().catch(() => {})
}
function stopKind(kind) {
  revisions[kind]++
  if (kind === 'video') { stopTracks(videoStream); videoStream=null; videoReady.value=false; if(video.value)video.value.srcObject=null }
  else { stopMeter(); stopTracks(audioStream); audioStream=null; audioReady.value=false }
}
function release() { stopKind('video'); stopKind('audio'); testAudio?.pause(); testAudio=null; checking.value=false }
defineExpose({ release })

function startMeter(stream) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!AudioContextClass || typeof requestAnimationFrame !== 'function') return
  try {
    meterContext = new AudioContextClass()
    const source = meterContext.createMediaStreamSource(stream), analyser = meterContext.createAnalyser()
    analyser.fftSize=256; source.connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    const update = () => {
      if (!meterContext) return
      analyser.getByteTimeDomainData(samples)
      let total=0;for(const sample of samples)total+=(sample-128)**2
      volume.value=Math.min(1,Math.sqrt(total/samples.length)/32)
      meterFrame=requestAnimationFrame(update)
    }
    update()
  } catch { stopMeter() }
}
async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return
  try { devices.value = await navigator.mediaDevices.enumerateDevices() } catch { /* Device names can remain unavailable until permission is granted. */ }
}
async function capture(kind) {
  stopKind(kind)
  const revision = revisions[kind]
  const id = kind === 'video' ? selection.cameraId : selection.microphoneId
  const constraints = id ? { deviceId:{ exact:id } } : true
  try {
    const stream = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { video:constraints, audio:false } : { audio:constraints, video:false })
    if (!alive || revision !== revisions[kind]) { stopTracks(stream); return }
    if (kind === 'video') {
      videoStream=stream; videoReady.value=true; await nextTick()
      if (alive && revision === revisions.video && video.value) { video.value.srcObject=stream; video.value.play?.().catch(()=>{}) }
    } else { audioStream=stream; audioReady.value=true; startMeter(stream) }
  } catch (error) {
    if (alive && revision === revisions[kind]) messages.value.push(mediaError(error,{ operation:kind==='video'?'camera':'mic' }))
  }
}
async function checkDevices() {
  if (checking.value) return
  messages.value=[]; checked.value=true
  if (!navigator.mediaDevices?.getUserMedia) { messages.value.push('当前浏览器无法检查设备，请使用支持摄像头和麦克风的安全连接。'); return }
  checking.value=true
  await Promise.all([capture('video'),capture('audio')])
  if (!alive) return
  await refreshDevices(); checking.value=false
}
async function changeInput(kind) { if (!checked.value || checking.value) return; messages.value=[]; await capture(kind); await refreshDevices() }
function testTone() {
  const rate=8000, length=Math.floor(rate*.35), buffer=new ArrayBuffer(44+length*2), view=new DataView(buffer)
  const write=(offset,text)=>[...text].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)))
  write(0,'RIFF');view.setUint32(4,36+length*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,length*2,true)
  for(let i=0;i<length;i++)view.setInt16(44+i*2,Math.round(Math.sin(i*2*Math.PI*440/rate)*9000*Math.sin(Math.PI*i/length)),true)
  let binary='';for(const byte of new Uint8Array(buffer))binary+=String.fromCharCode(byte)
  return `data:audio/wav;base64,${btoa(binary)}`
}
async function playSpeakerTest() {
  try {
    testAudio?.pause(); testAudio=new Audio(testTone())
    if (speakerSupported && selection.speakerId) await testAudio.setSinkId(selection.speakerId)
    await testAudio.play()
  } catch { messages.value.push('无法播放测试音，请检查扬声器和浏览器声音设置。') }
}
function onDevicesChanged() { if (checked.value) refreshDevices() }
function onToggle(event) { if (!event.target.open) release() }
onMounted(()=>navigator.mediaDevices?.addEventListener?.('devicechange',onDevicesChanged))
onBeforeUnmount(()=>{alive=false;navigator.mediaDevices?.removeEventListener?.('devicechange',onDevicesChanged);release()})
</script>

<template>
  <details class="device-check" @toggle="onToggle">
    <summary><span>入会前设备检查</span><small>按需检查，默认关闭</small></summary>
    <div class="device-check-body">
      <p class="muted">点击检查后，浏览器会请求摄像头和麦克风权限。</p>
      <button type="button" class="meeting-button outline small" :disabled="checking" @click="checkDevices"><CheckCircle2 :size="15"/> {{ checking ? '正在检查…' : checked ? '重新检查设备' : '检查设备' }}</button>
      <template v-if="checked">
        <div class="device-preview"><video ref="video" v-show="videoReady" autoplay playsinline muted /><span v-if="!videoReady"><Camera :size="22"/> 摄像头预览未开启</span></div>
        <label class="device-select">摄像头<select v-model="selection.cameraId" @change="changeInput('video')"><option value="">系统默认</option><option v-for="(device,index) in cameras" :key="device.deviceId || index" :value="device.deviceId">{{ device.label || `摄像头 ${index+1}` }}</option></select></label>
        <label class="device-select">麦克风<select v-model="selection.microphoneId" @change="changeInput('audio')"><option value="">系统默认</option><option v-for="(device,index) in microphones" :key="device.deviceId || index" :value="device.deviceId">{{ device.label || `麦克风 ${index+1}` }}</option></select></label>
        <div class="device-meter"><Mic :size="15"/><span>麦克风音量</span><div role="meter" aria-label="麦克风音量" :aria-valuenow="Math.round(volume*100)" aria-valuemin="0" aria-valuemax="100"><i :style="{transform:`scaleX(${volume})`}"></i></div></div>
        <label v-if="speakerSupported" class="device-select">扬声器<select v-model="selection.speakerId"><option value="">系统默认</option><option v-for="(device,index) in speakers" :key="device.deviceId || index" :value="device.deviceId">{{ device.label || `扬声器 ${index+1}` }}</option></select></label>
        <button type="button" class="device-speaker-test" @click="playSpeakerTest"><Volume2 :size="15"/> 播放扬声器测试音</button>
        <div class="device-optins"><label><input v-model="selection.microphoneOn" type="checkbox"/> 入会时开启麦克风</label><label><input v-model="selection.cameraOn" type="checkbox"/> 入会时开启摄像头</label></div>
        <p v-for="message in messages" :key="message" class="device-message" role="status">{{ message }}</p>
      </template>
    </div>
  </details>
</template>
