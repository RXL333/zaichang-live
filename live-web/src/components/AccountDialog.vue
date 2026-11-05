<script setup>
import { ref, watch } from 'vue'
import { X, ArrowRight } from 'lucide-vue-next'
import { useUser } from '../stores/user'
const user = useUser()
const mode = ref('login'), username = ref(''), nickname = ref(''), password = ref(''), error = ref(''), loading = ref(false)
watch(() => user.authOpen, () => { error.value = ''; password.value = '' })
async function submit() {
  error.value = ''; loading.value = true
  try { await user.authenticate(mode.value, { username: username.value, nickname: nickname.value, password: password.value }) }
  catch (e) { error.value = e.message }
  finally { loading.value = false }
}
</script>
<template>
  <Teleport to="body">
    <div v-if="user.authOpen" class="modal-backdrop" @click.self="user.authOpen = false" @keydown.esc="user.authOpen = false">
      <section class="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button class="icon-button modal-close" aria-label="关闭" @click="user.authOpen = false"><X :size="20" /></button>
        <div class="modal-eyebrow">ACCOUNT / 账号 <span>✳</span></div>
        <h2 id="auth-title">{{ mode === 'login' ? '登录在场' : '创建账号' }}</h2>
        <p class="muted">{{ mode === 'login' ? '登录后参与直播互动。' : '创建账号，开启直播与互动。' }}</p>
        <form class="form-stack" @submit.prevent="submit">
          <label>账号<input v-model.trim="username" required minlength="3" maxlength="32" autocomplete="username" placeholder="3–32 位字母、数字或下划线" /></label>
          <label v-if="mode === 'register'">你的昵称<input v-model.trim="nickname" required maxlength="40" autocomplete="nickname" placeholder="大家会这样称呼你" /></label>
          <label>密码<input v-model="password" required minlength="8" maxlength="72" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" placeholder="至少 8 个字符" /></label>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button class="button button-primary button-full" :disabled="loading">{{ loading ? '请稍等…' : mode === 'login' ? '登录' : '创建账号' }} <ArrowRight :size="17" /></button>
        </form>
        <p class="auth-switch">{{ mode === 'login' ? '还没有账号？' : '已经有账号？' }} <button class="text-link" @click="mode = mode === 'login' ? 'register' : 'login'; error = ''">{{ mode === 'login' ? '注册账号' : '登录账号' }}</button></p>
      </section>
    </div>
  </Teleport>
</template>
