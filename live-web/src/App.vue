<script setup>
import { computed, nextTick, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LogOut, Menu, Monitor, Moon, Sun, X } from 'lucide-vue-next'
import { useUser } from './stores/user'
import { useServiceHealth } from './stores/serviceHealth'
import AccountDialog from './components/AccountDialog.vue'
import LogoMark from './components/LogoMark.vue'
import ServiceStatus from './components/ServiceStatus.vue'
import { useTheme } from './useTheme'

const user=useUser(),service=useServiceHealth(),route=useRoute(),router=useRouter(),menu=ref(false)
const insideMeeting = computed(() => route.path.startsWith('/meeting/'))
const { preference, theme } = useTheme()
const themeIcon = computed(() => ({ system: Monitor, light: Sun, dark: Moon })[preference.value])
watchEffect(() => {
  const root = document.documentElement
  root.dataset.theme = insideMeeting.value ? 'light' : theme.value
  const themeColor = document.querySelector('meta[name="theme-color"]')
  if (themeColor) {
    themeColor.content = getComputedStyle(root).getPropertyValue(insideMeeting.value ? '--room' : '--mist').trim()
  }
})
watch(()=>route.path,path=>{if((path==='/' || path.startsWith('/join/')) && service.status==='idle')service.start()},{immediate:true})
watch(()=>service.status,status=>{if(status==='ready' && (!user.ready || user.loadError))user.load()},{immediate:true})
onMounted(()=>{if(route.path.startsWith('/meeting/'))user.load()})
async function logout(){try{await user.logout();menu.value=false;router.push('/')}catch{/* The current session stays visible if logout failed. */}}
async function myMeetings(){await router.push('/');await nextTick();document.getElementById('meetings')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
</script>
<template>
  <div class="conference-app" :class="{ 'inside-meeting': insideMeeting }">
    <header v-if="!insideMeeting" class="site-header">
      <RouterLink to="/" class="site-brand" aria-label="在场会议首页"><LogoMark /><span>在场会议</span></RouterLink>
      <nav class="site-nav" aria-label="导航"><RouterLink to="/">会议</RouterLink><button class="nav-action" @click="myMeetings">我的会议</button></nav>
      <div class="site-actions">
        <label class="site-theme">
          <component :is="themeIcon" :size="16" aria-hidden="true" />
          <select v-model="preference" aria-label="页面外观">
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
        <div class="site-account"><button v-if="!user.current" class="button button-outline" @click="user.openAuth()">登录 / 注册</button><div v-else class="account-wrap"><button class="account-button" @click="menu=!menu" :aria-expanded="menu"><span class="avatar tiny">{{ user.current.nickname?.slice(0,1) }}</span><span>{{ user.current.nickname }}</span></button><div v-if="menu" class="account-popover"><button @click="logout"><LogOut :size="15" /> 退出登录</button></div></div></div>
        <button class="site-mobile-menu" @click="menu=!menu" :aria-label="menu ? '关闭菜单' : '打开菜单'"><X v-if="menu" :size="22"/><Menu v-else :size="22"/></button>
      </div>
      <div v-if="menu" class="mobile-account"><button v-if="!user.current" @click="user.openAuth();menu=false">登录 / 注册</button><button v-else @click="logout">退出登录</button></div>
    </header>
    <ServiceStatus v-if="!insideMeeting" />
    <RouterView v-slot="{ Component, route: viewRoute }"><Transition name="page" mode="out-in"><component :is="Component" :key="viewRoute.fullPath" /></Transition></RouterView>
    <AccountDialog />
  </div>
</template>
