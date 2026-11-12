<script setup>
import { ref, watch } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import { useUser } from '../stores/user'
import { requestError } from '../mediaErrors'
import ModalDialog from './ModalDialog.vue'
const user = useUser()
const mode = ref('login'), username = ref(''), nickname = ref(''), password = ref(''), confirmPassword = ref(''), error = ref(''), loading = ref(false)
watch(() => user.authOpen, () => {
  error.value = ''; password.value = ''; confirmPassword.value = ''
})
async function submit() {
  error.value = ''
  if (mode.value === 'register' && password.value !== confirmPassword.value) { error.value = '两次输入的密码不一致，请重新确认。'; return }
  loading.value = true
  try { await user.authenticate(mode.value, { username: username.value, nickname: nickname.value, password: password.value }) }
  catch (e) { error.value = requestError(e) }
  finally { loading.value = false }
}
</script>
<template>
  <ModalDialog :open="user.authOpen" labelledby="auth-title" describedby="auth-description" dialog-class="auth-modal" @close="user.closeAuth()">
        <h2 id="auth-title">{{ mode === 'login' ? '登录在场' : '创建账号' }}</h2>
        <p id="auth-description" class="muted">{{ mode === 'login' ? '登录后创建或加入会议。' : '创建账号，开始你的会议。' }}</p>
        <form class="form-stack" @submit.prevent="submit">
          <label>账号<input v-model.trim="username" required minlength="3" maxlength="32" autocomplete="username" placeholder="3–32 位字母、数字或下划线" /></label>
          <label v-if="mode === 'register'">你的昵称<input v-model.trim="nickname" required maxlength="40" autocomplete="nickname" placeholder="大家会这样称呼你" /></label>
          <label>密码<input v-model="password" required minlength="8" maxlength="72" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" placeholder="至少 8 个字符" /></label>
          <label v-if="mode === 'register'">确认密码<input v-model="confirmPassword" required minlength="8" maxlength="72" type="password" autocomplete="new-password" placeholder="再次输入密码" /></label>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button class="button button-primary button-full" :disabled="loading">{{ loading ? '请稍等…' : mode === 'login' ? '登录' : '创建账号' }} <ArrowRight :size="17" /></button>
        </form>
        <p class="auth-switch">{{ mode === 'login' ? '还没有账号？' : '已经有账号？' }} <button class="text-link" @click="mode = mode === 'login' ? 'register' : 'login'; error = ''; confirmPassword = ''">{{ mode === 'login' ? '注册账号' : '登录账号' }}</button></p>
  </ModalDialog>
</template>
