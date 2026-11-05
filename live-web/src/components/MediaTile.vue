<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
const props = defineProps({ track: Object, muted: Boolean })
const el = ref(null)
function attach(track) { if (track && el.value) track.attach(el.value) }
function detach(track) { if (track && el.value) track.detach(el.value) }
onMounted(() => attach(props.track))
watch(() => props.track, (next, previous) => { detach(previous); attach(next) })
onBeforeUnmount(() => detach(props.track))
</script>
<template><video ref="el" autoplay playsinline :muted="muted" /></template>
