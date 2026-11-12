<script setup>
import { computed } from 'vue'
import { encode } from 'uqr'

const props = defineProps({ value: { type:String, required:true } })
const qr = computed(() => {
  const matrix = encode(props.value, { ecc:'M' })
  const path = matrix.data.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`M${x+4} ${y+4}h1v1h-1z`] : [])).join('')
  return { size:matrix.size+8, path }
})
</script>

<template>
  <svg class="invite-qr" :viewBox="`0 0 ${qr.size} ${qr.size}`" role="img" aria-label="会议邀请二维码" shape-rendering="crispEdges">
    <rect width="100%" height="100%" fill="white" />
    <path :d="qr.path" fill="#0e1a2b" />
  </svg>
</template>
