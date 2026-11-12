import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { loadDevicePreferences, saveDevicePreferences, supportsSpeakerSelection } from './devicePreferences'
import { mediaError } from './mediaErrors'

const fields = { audioinput:'microphoneId', videoinput:'cameraId', audiooutput:'speakerId' }
const labels = { audioinput:'麦克风', videoinput:'摄像头', audiooutput:'扬声器' }

export function useMeetingDevices({ room, mediaState, notify, initial = {} }) {
  const selected = reactive({ ...loadDevicePreferences(), ...Object.fromEntries(Object.values(fields).filter(field=>typeof initial[field]==='string').map(field=>[field,initial[field]])) })
  const devices = ref([]), switching = ref(false), speakerSupported = supportsSpeakerSelection()
  let alive=true, revision=0

  async function choose(kind, id) {
    if (!fields[kind] || (kind==='audiooutput' && !speakerSupported)) return false
    if (switching.value) return false
    if (!room.value || mediaState.value !== 'connected') { notify('请先连接音视频，再切换设备。'); return false }
    const available = devices.value.filter(device=>device.kind===kind && device.deviceId)
    const target = id || available.find(device=>device.deviceId==='default')?.deviceId || available[0]?.deviceId || 'default'
    switching.value=true
    try {
      const success=await room.value.switchActiveDevice(kind,target,!!id)
      if (success===false) throw new Error('device switch failed')
      selected[fields[kind]]=id; saveDevicePreferences(selected); return true
    } catch (error) {
      notify(mediaError(error,{operation:kind==='videoinput'?'camera':kind==='audioinput'?'mic':'speaker'}))
      return false
    } finally { switching.value=false }
  }
  async function refresh(notifyRemoved=false) {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const current=++revision
    let next
    try { next=await navigator.mediaDevices.enumerateDevices() } catch { return }
    if (!alive || current!==revision) return
    const previous=devices.value; devices.value=next
    if (!notifyRemoved) return
    for (const [kind,field] of Object.entries(fields)) {
      if (kind==='audiooutput' && !speakerSupported) continue
      const id=selected[field]
      if (!id || !previous.some(device=>device.kind===kind && device.deviceId===id) || next.some(device=>device.kind===kind && device.deviceId===id)) continue
      selected[field]=''; saveDevicePreferences(selected)
      const fallback=next.find(device=>device.kind===kind && device.deviceId)
      if (fallback && await choose(kind,'')) notify(`${labels[kind]}已断开，已切换到可用设备。`)
      else notify(`${labels[kind]}已断开，请连接设备后重试。`)
    }
  }
  function onDeviceChange() { refresh(true) }
  onMounted(()=>{navigator.mediaDevices?.addEventListener?.('devicechange',onDeviceChange);refresh()})
  onBeforeUnmount(()=>{alive=false;revision++;navigator.mediaDevices?.removeEventListener?.('devicechange',onDeviceChange)})
  return { devices, selected, switching, speakerSupported, choose, refresh }
}
