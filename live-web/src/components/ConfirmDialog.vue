<script setup>
import { useId } from 'vue'
import ModalDialog from './ModalDialog.vue'

defineProps({ open: Boolean, title: String, description: String, confirmText: { type: String, default: '确认' }, busy: Boolean })
const emit = defineEmits(['close', 'confirm'])
const titleId = useId(), descriptionId = useId()
</script>

<template>
  <ModalDialog :open="open" :labelledby="titleId" :describedby="descriptionId" dialog-class="meeting-dialog confirm-dialog" initial-focus=".confirm-cancel" @close="!busy && emit('close')">
    <h2 :id="titleId">{{ title }}</h2>
    <p :id="descriptionId" class="muted">{{ description }}</p>
    <div class="confirm-actions">
      <button type="button" class="meeting-button outline confirm-cancel" :disabled="busy" @click="emit('close')">取消</button>
      <button type="button" class="meeting-button destructive" :disabled="busy" @click="emit('confirm')">{{ busy ? '正在处理…' : confirmText }}</button>
    </div>
  </ModalDialog>
</template>
