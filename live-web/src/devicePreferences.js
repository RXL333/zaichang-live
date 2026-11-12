import { defineStore } from 'pinia'

const key = 'zaichang.devices'
const kinds = ['microphoneId', 'cameraId', 'speakerId']
export function loadDevicePreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}')
    return Object.fromEntries(kinds.map(kind => [kind, typeof saved?.[kind] === 'string' ? saved[kind].slice(0, 512) : '']))
  } catch { return Object.fromEntries(kinds.map(kind => [kind, ''])) }
}
export function saveDevicePreferences(value) {
  const selected = Object.fromEntries(kinds.map(kind => [kind, typeof value?.[kind] === 'string' ? value[kind].slice(0, 512) : '']))
  try { localStorage.setItem(key, JSON.stringify(selected)) } catch { /* The current page can still use its selection. */ }
}

// Opt-in switches are deliberately memory-only and consumed once for one meeting.
export const useJoinDevices = defineStore('joinDevices', {
  state: () => ({ pending: null }),
  actions: {
    prepare(number, selection) { this.pending = { number, ...selection } },
    consume(number) { const value = this.pending?.number === number ? this.pending : null; this.pending = null; return value },
  },
})

export function supportsSpeakerSelection() {
  return typeof HTMLMediaElement !== 'undefined' && typeof HTMLMediaElement.prototype.setSinkId === 'function'
}
