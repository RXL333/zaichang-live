<script setup>
import { ref } from 'vue'
const icons = { heart: '♥', clap: '✦', fire: '✹', wow: '✧', flower: '✿', cookie: '◉', star: '★' }
const items = ref([]); let nextId = 0
function add(value) { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || items.value.length >= 12) return; items.value.push({ id: nextId++, icon: icons[value] || '✦', x: Math.random() * 45 }) }
function remove(id) { items.value = items.value.filter(item => item.id !== id) }
defineExpose({ add })
</script>
<template><div class="reaction-layer" aria-hidden="true"><span v-for="item in items" :key="item.id" :style="{ right: `${item.x}px` }" @animationend="remove(item.id)">{{ item.icon }}</span></div></template>
