<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LogOut, Menu, X } from 'lucide-vue-next'
import { useUser } from './stores/user'
import AccountDialog from './components/AccountDialog.vue'
import LogoMark from './components/LogoMark.vue'

const user=useUser(),route=useRoute(),router=useRouter(),menu=ref(false)
onMounted(()=>user.load())
async function logout(){try{await user.logout();menu.value=false;router.push('/')}catch{/* The current session stays visible if logout failed. */}}
async function myMeetings(){await router.push('/');document.getElementById('meetings')?.scrollIntoView({behavior:'smooth'})}
</script>
<template>
  <div class="conference-app" :class="{ 'inside-meeting': route.path.startsWith('/meeting/') }">
    <header v-if="!route.path.startsWith('/meeting/')" class="site-header">
      <RouterLink to="/" class="site-brand" aria-label="在场会议首页"><LogoMark /><span>在场会议<small>ZAICHANG MEET</small></span></RouterLink>
      <nav class="site-nav" aria-label="导航"><RouterLink to="/">会议</RouterLink><a href="/#meetings" @click.prevent="myMeetings">我的会议</a></nav>
      <div class="site-account"><span class="header-caption">让交流，更有意义。</span><button v-if="!user.current" class="button button-outline" @click="user.openAuth()">登录 / 注册</button><div v-else class="account-wrap"><button class="account-button" @click="menu=!menu" :aria-expanded="menu"><span class="avatar tiny">{{ user.current.nickname?.slice(0,1) }}</span><span>{{ user.current.nickname }}</span></button><div v-if="menu" class="account-popover"><button @click="logout"><LogOut :size="15" /> 退出登录</button></div></div></div>
      <button class="site-mobile-menu" @click="menu=!menu" :aria-label="menu ? '关闭菜单' : '打开菜单'"><X v-if="menu" :size="22"/><Menu v-else :size="22"/></button>
      <div v-if="menu" class="mobile-account"><button v-if="!user.current" @click="user.openAuth();menu=false">登录 / 注册</button><button v-else @click="logout">退出登录</button></div>
    </header>
    <RouterView :key="route.fullPath" />
    <AccountDialog />
  </div>
</template>
