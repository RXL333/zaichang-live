<script setup>
import { ref } from 'vue'
const items = ref([]); let nextId = 1, nextLane = 0
function add(message) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (items.value.length >= 24) return
  items.value.push({ id: nextId++, lane: nextLane, content: message.content })
  nextLane = (nextLane + 1) % 6
}
function remove(id) { items.value = items.value.filter(item => item.id !== id) }
function clear() { items.value = []; nextLane = 0 }
defineExpose({ add, clear })
</script>
<template><div class="danmaku-layer" aria-hidden="true"><span v-for="item in items" :key="item.id" class="flying-danmaku" :style="{ top: `${8 + item.lane * 9}%` }" @animationend="remove(item.id)">{{ item.content }}</span></div></template>
