<script setup>
import { useServiceHealth } from '../stores/serviceHealth'

const service = useServiceHealth()
</script>

<template>
  <Transition name="service-status">
    <div v-if="service.status === 'starting' || service.status === 'timeout'" class="service-status" role="status" aria-live="polite">
      <span v-if="service.status === 'starting'">会议服务正在启动，请稍候…</span>
      <template v-else>
        <span>会议服务暂未就绪，请重试或查看使用说明。</span>
        <button type="button" @click="service.start()">重试</button>
        <a href="https://github.com/RXL333/zaichang-live/blob/main/docs/deployment.md" target="_blank" rel="noopener noreferrer">使用说明</a>
      </template>
    </div>
  </Transition>
</template>
