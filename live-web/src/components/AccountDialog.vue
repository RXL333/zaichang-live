<script setup>
import { nextTick, ref, watch } from 'vue'
import { X, ArrowRight } from 'lucide-vue-next'
import { useUser } from '../stores/user'
const user = useUser()
const mode = ref('login'), username = ref(''), nickname = ref(''), password = ref(''), confirmPassword = ref(''), error = ref(''), loading = ref(false)
const dialog = ref(null), usernameInput = ref(null)
let previousFocus = null
watch(() => user.authOpen, async open => {
  error.value = ''; password.value = ''; confirmPassword.value = ''
  if (open) {
    previousFocus = document.activeElement
    await nextTick()
    usernameInput.value?.focus()
  } else {
    if (previousFocus?.isConnected) previousFocus.focus()
    previousFocus = null
  }
})
function keepFocus(event) {
  const elements = [...dialog.value.querySelectorAll('button:not([disabled]), input:not([disabled])')]
  if (!elements.length) return
  const first = elements[0], last = elements[elements.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
async function submit() {
  error.value = ''
  if (mode.value === 'register' && password.value !== confirmPassword.value) { error.value = '两次输入的密码不一致，请重新确认。'; return }
  loading.value = true
  try { await user.authenticate(mode.value, { username: username.value, nickname: nickname.value, password: password.value }) }
  catch (e) { error.value = e.message }
  finally { loading.value = false }
}
</script>
<template>
  <Teleport to="body">
    <div v-if="user.authOpen" class="modal-backdrop" @click.self="user.closeAuth()" @keydown.esc.stop.prevent="user.closeAuth()" @keydown.tab="keepFocus">
      <section ref="dialog" class="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" aria-describedby="auth-description">
        <button class="icon-button modal-close" aria-label="关闭" @click="user.closeAuth()"><X :size="20" /></button>
        <div class="modal-eyebrow">ACCOUNT / 账号 <span>✳</span></div>
        <h2 id="auth-title">{{ mode === 'login' ? '登录在场' : '创建账号' }}</h2>
        <p id="auth-description" class="muted">{{ mode === 'login' ? '登录后参与直播互动。' : '创建账号，开启直播与互动。' }}</p>
        <form class="form-stack" @submit.prevent="submit">
          <label>账号<input ref="usernameInput" v-model.trim="username" required minlength="3" maxlength="32" autocomplete="username" placeholder="3–32 位字母、数字或下划线" /></label>
          <label v-if="mode === 'register'">你的昵称<input v-model.trim="nickname" required maxlength="40" autocomplete="nickname" placeholder="大家会这样称呼你" /></label>
          <label>密码<input v-model="password" required minlength="8" maxlength="72" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" placeholder="至少 8 个字符" /></label>
          <label v-if="mode === 'register'">确认密码<input v-model="confirmPassword" required minlength="8" maxlength="72" type="password" autocomplete="new-password" placeholder="再次输入密码" /></label>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button class="button button-primary button-full" :disabled="loading">{{ loading ? '请稍等…' : mode === 'login' ? '登录' : '创建账号' }} <ArrowRight :size="17" /></button>
        </form>
        <p class="auth-switch">{{ mode === 'login' ? '还没有账号？' : '已经有账号？' }} <button class="text-link" @click="mode = mode === 'login' ? 'register' : 'login'; error = ''; confirmPassword = ''">{{ mode === 'login' ? '注册账号' : '登录账号' }}</button></p>
      </section>
    </div>
  </Teleport>
</template>
