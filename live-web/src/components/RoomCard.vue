<script setup>
import { Eye, ArrowUpRight } from 'lucide-vue-next'
defineProps({ room: { type: Object, required: true } })
</script>
<template>
  <RouterLink :to="`/room/${room.id}`" class="room-card">
    <div class="room-cover" :class="`cover-${room.coverStyle || 'tomato'}`">
      <span class="cover-word">{{ room.category }}</span>
      <div class="cover-orbit orbit-one"></div><div class="cover-orbit orbit-two"></div><span class="cover-star">◒</span>
      <span class="cover-big">{{ (room.title || '在场').slice(0, 2) }}</span>
      <span class="cover-bottom">ZAICHANG LIVE</span>
      <span class="room-badge" :class="{ live: room.status === 'LIVE' }"><i></i>{{ room.status === 'LIVE' ? '直播中' : room.status === 'RECONNECTING' ? '恢复中' : '未开播' }}</span>
      <span v-if="room.status === 'LIVE'" class="cover-viewers"><Eye :size="13" /> {{ room.viewerCount ?? '—' }}</span>
    </div>
    <div class="room-card-info"><div class="avatar small">{{ room.ownerName?.slice(0, 1) || '频' }}</div><div class="room-copy"><strong>{{ room.title }}</strong><span>{{ room.ownerName }} · {{ room.category }}</span></div><ArrowUpRight class="card-arrow" :size="17" /></div>
  </RouterLink>
</template>
